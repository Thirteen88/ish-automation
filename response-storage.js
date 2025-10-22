/**
 * Response Storage
 * Database integration for response history, search, and export
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class ResponseStorage {
  constructor(options = {}) {
    this.options = {
      dbPath: options.dbPath || path.join(process.cwd(), 'responses.db'),
      enableVersioning: true,
      maxHistoryPerPrompt: 100,
      ...options
    };

    this.db = null;
    this.initialize();
  }

  /**
   * Initialize database and create tables
   */
  initialize() {
    try {
      // Create database directory if it doesn't exist
      const dbDir = path.dirname(this.options.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Open database connection
      this.db = new Database(this.options.dbPath);
      this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better performance

      // Create tables
      this._createTables();

      console.log(`Database initialized at: ${this.options.dbPath}`);
    } catch (error) {
      throw new Error(`Failed to initialize database: ${error.message}`);
    }
  }

  /**
   * Create database tables
   */
  _createTables() {
    // Responses table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS responses (
        id TEXT PRIMARY KEY,
        prompt TEXT NOT NULL,
        prompt_hash TEXT NOT NULL,
        platform TEXT NOT NULL,
        model TEXT,
        response_text TEXT NOT NULL,
        tokens_input INTEGER DEFAULT 0,
        tokens_output INTEGER DEFAULT 0,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        version INTEGER DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_prompt_hash ON responses(prompt_hash);
      CREATE INDEX IF NOT EXISTS idx_platform ON responses(platform);
      CREATE INDEX IF NOT EXISTS idx_created_at ON responses(created_at);
      CREATE INDEX IF NOT EXISTS idx_version ON responses(version);
    `);

    // Sessions table for grouping related responses
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_session_created ON sessions(created_at);
    `);

    // Session responses mapping
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_responses (
        session_id TEXT NOT NULL,
        response_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        PRIMARY KEY (session_id, response_id),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (response_id) REFERENCES responses(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_session_responses ON session_responses(session_id);
    `);

    // Tags table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tag_name ON tags(name);
    `);

    // Response tags mapping
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS response_tags (
        response_id TEXT NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (response_id, tag_id),
        FOREIGN KEY (response_id) REFERENCES responses(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_response_tags ON response_tags(response_id);
    `);

    // Full-text search table
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS responses_fts USING fts5(
        response_id UNINDEXED,
        prompt,
        response_text
      );

      CREATE TRIGGER IF NOT EXISTS responses_fts_insert AFTER INSERT ON responses BEGIN
        INSERT INTO responses_fts(response_id, prompt, response_text)
        VALUES (new.id, new.prompt, new.response_text);
      END;

      CREATE TRIGGER IF NOT EXISTS responses_fts_delete AFTER DELETE ON responses BEGIN
        DELETE FROM responses_fts WHERE response_id = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS responses_fts_update AFTER UPDATE ON responses BEGIN
        DELETE FROM responses_fts WHERE response_id = old.id;
        INSERT INTO responses_fts(response_id, prompt, response_text)
        VALUES (new.id, new.prompt, new.response_text);
      END;
    `);
  }

  /**
   * Store a response
   * @param {Object} response - Parsed response object
   * @param {string} prompt - Original prompt
   * @param {Object} options - Storage options
   * @returns {string} Response ID
   */
  storeResponse(response, prompt, options = {}) {
    const { sessionId, tags = [], metadata = {} } = options;

    try {
      const id = uuidv4();
      const promptHash = this._hashPrompt(prompt);
      const now = Date.now();

      // Get version number
      let version = 1;
      if (this.options.enableVersioning) {
        const existing = this.db.prepare(
          'SELECT MAX(version) as max_version FROM responses WHERE prompt_hash = ?'
        ).get(promptHash);
        version = (existing?.max_version || 0) + 1;
      }

      // Store response
      const stmt = this.db.prepare(`
        INSERT INTO responses (
          id, prompt, prompt_hash, platform, model, response_text,
          tokens_input, tokens_output, metadata, created_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        prompt,
        promptHash,
        response.platform,
        response.model || 'unknown',
        response.text || '',
        response.tokens?.input || 0,
        response.tokens?.output || 0,
        JSON.stringify({ ...response.metadata, ...metadata }),
        now,
        version
      );

      // Add to session if specified
      if (sessionId) {
        this._addResponseToSession(sessionId, id);
      }

      // Add tags
      if (tags.length > 0) {
        this._tagResponse(id, tags);
      }

      // Clean up old versions if necessary
      if (this.options.enableVersioning && this.options.maxHistoryPerPrompt) {
        this._cleanupOldVersions(promptHash);
      }

      return id;
    } catch (error) {
      throw new Error(`Failed to store response: ${error.message}`);
    }
  }

  /**
   * Get response by ID
   * @param {string} id - Response ID
   * @returns {Object|null} Response object
   */
  getResponse(id) {
    try {
      const stmt = this.db.prepare('SELECT * FROM responses WHERE id = ?');
      const row = stmt.get(id);

      if (!row) return null;

      return this._rowToResponse(row);
    } catch (error) {
      throw new Error(`Failed to get response: ${error.message}`);
    }
  }

  /**
   * Get response history for a prompt
   * @param {string} prompt - Prompt text
   * @param {Object} options - Query options
   * @returns {Array} Array of responses
   */
  getHistory(prompt, options = {}) {
    const { limit = 10, offset = 0, platform = null } = options;

    try {
      const promptHash = this._hashPrompt(prompt);

      let query = 'SELECT * FROM responses WHERE prompt_hash = ?';
      const params = [promptHash];

      if (platform) {
        query += ' AND platform = ?';
        params.push(platform);
      }

      query += ' ORDER BY version DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params);

      return rows.map(row => this._rowToResponse(row));
    } catch (error) {
      throw new Error(`Failed to get history: ${error.message}`);
    }
  }

  /**
   * Search responses
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Array} Search results
   */
  search(query, options = {}) {
    const {
      limit = 20,
      offset = 0,
      platform = null,
      tags = [],
      startDate = null,
      endDate = null
    } = options;

    try {
      let sql = `
        SELECT r.* FROM responses r
        WHERE r.id IN (
          SELECT response_id FROM responses_fts
          WHERE responses_fts MATCH ?
        )
      `;
      const params = [query];

      // Filter by platform
      if (platform) {
        sql += ' AND r.platform = ?';
        params.push(platform);
      }

      // Filter by tags
      if (tags.length > 0) {
        sql += ` AND r.id IN (
          SELECT rt.response_id FROM response_tags rt
          INNER JOIN tags t ON rt.tag_id = t.id
          WHERE t.name IN (${tags.map(() => '?').join(',')})
          GROUP BY rt.response_id
          HAVING COUNT(DISTINCT t.name) = ?
        )`;
        params.push(...tags, tags.length);
      }

      // Filter by date range
      if (startDate) {
        sql += ' AND r.created_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        sql += ' AND r.created_at <= ?';
        params.push(endDate);
      }

      sql += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params);

      return rows.map(row => this._rowToResponse(row));
    } catch (error) {
      throw new Error(`Failed to search: ${error.message}`);
    }
  }

  /**
   * Create a session
   * @param {Object} options - Session options
   * @returns {string} Session ID
   */
  createSession(options = {}) {
    const { name, description, metadata = {} } = options;

    try {
      const id = uuidv4();
      const now = Date.now();

      const stmt = this.db.prepare(`
        INSERT INTO sessions (id, name, description, created_at, updated_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        name || `Session ${new Date().toLocaleString()}`,
        description || '',
        now,
        now,
        JSON.stringify(metadata)
      );

      return id;
    } catch (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }
  }

  /**
   * Get session with responses
   * @param {string} sessionId - Session ID
   * @returns {Object} Session object with responses
   */
  getSession(sessionId) {
    try {
      // Get session
      const sessionStmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
      const session = sessionStmt.get(sessionId);

      if (!session) return null;

      // Get responses
      const responsesStmt = this.db.prepare(`
        SELECT r.* FROM responses r
        INNER JOIN session_responses sr ON r.id = sr.response_id
        WHERE sr.session_id = ?
        ORDER BY sr.sequence ASC
      `);
      const responses = responsesStmt.all(sessionId);

      return {
        id: session.id,
        name: session.name,
        description: session.description,
        createdAt: new Date(session.created_at),
        updatedAt: new Date(session.updated_at),
        metadata: JSON.parse(session.metadata || '{}'),
        responses: responses.map(row => this._rowToResponse(row))
      };
    } catch (error) {
      throw new Error(`Failed to get session: ${error.message}`);
    }
  }

  /**
   * Export responses
   * @param {Object} options - Export options
   * @returns {Object} Export data
   */
  exportResponses(options = {}) {
    const {
      format = 'json',
      platform = null,
      startDate = null,
      endDate = null,
      tags = [],
      sessionId = null
    } = options;

    try {
      let responses;

      if (sessionId) {
        const session = this.getSession(sessionId);
        responses = session?.responses || [];
      } else {
        let sql = 'SELECT * FROM responses WHERE 1=1';
        const params = [];

        if (platform) {
          sql += ' AND platform = ?';
          params.push(platform);
        }

        if (startDate) {
          sql += ' AND created_at >= ?';
          params.push(startDate);
        }

        if (endDate) {
          sql += ' AND created_at <= ?';
          params.push(endDate);
        }

        if (tags.length > 0) {
          sql += ` AND id IN (
            SELECT rt.response_id FROM response_tags rt
            INNER JOIN tags t ON rt.tag_id = t.id
            WHERE t.name IN (${tags.map(() => '?').join(',')})
          )`;
          params.push(...tags);
        }

        sql += ' ORDER BY created_at DESC';

        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params);
        responses = rows.map(row => this._rowToResponse(row));
      }

      return this._formatExport(responses, format);
    } catch (error) {
      throw new Error(`Failed to export responses: ${error.message}`);
    }
  }

  /**
   * Get statistics
   * @returns {Object} Statistics object
   */
  getStatistics() {
    try {
      const stats = {};

      // Total responses
      stats.totalResponses = this.db.prepare(
        'SELECT COUNT(*) as count FROM responses'
      ).get().count;

      // Responses by platform
      const platformStats = this.db.prepare(`
        SELECT platform, COUNT(*) as count
        FROM responses
        GROUP BY platform
        ORDER BY count DESC
      `).all();
      stats.byPlatform = Object.fromEntries(
        platformStats.map(row => [row.platform, row.count])
      );

      // Total tokens
      const tokenStats = this.db.prepare(`
        SELECT
          SUM(tokens_input) as total_input,
          SUM(tokens_output) as total_output
        FROM responses
      `).get();
      stats.tokens = {
        input: tokenStats.total_input || 0,
        output: tokenStats.total_output || 0,
        total: (tokenStats.total_input || 0) + (tokenStats.total_output || 0)
      };

      // Total sessions
      stats.totalSessions = this.db.prepare(
        'SELECT COUNT(*) as count FROM sessions'
      ).get().count;

      // Total tags
      stats.totalTags = this.db.prepare(
        'SELECT COUNT(*) as count FROM tags'
      ).get().count;

      // Recent activity (last 7 days)
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      stats.recentActivity = this.db.prepare(`
        SELECT COUNT(*) as count FROM responses
        WHERE created_at >= ?
      `).get(sevenDaysAgo).count;

      return stats;
    } catch (error) {
      throw new Error(`Failed to get statistics: ${error.message}`);
    }
  }

  /**
   * Delete response
   * @param {string} id - Response ID
   */
  deleteResponse(id) {
    try {
      const stmt = this.db.prepare('DELETE FROM responses WHERE id = ?');
      stmt.run(id);
    } catch (error) {
      throw new Error(`Failed to delete response: ${error.message}`);
    }
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // Private helper methods

  _hashPrompt(prompt) {
    // Simple hash function for prompt deduplication
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
      const char = prompt.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  _rowToResponse(row) {
    return {
      id: row.id,
      prompt: row.prompt,
      platform: row.platform,
      model: row.model,
      text: row.response_text,
      tokens: {
        input: row.tokens_input,
        output: row.tokens_output
      },
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: new Date(row.created_at),
      version: row.version
    };
  }

  _addResponseToSession(sessionId, responseId) {
    try {
      // Get next sequence number
      const maxSeq = this.db.prepare(
        'SELECT MAX(sequence) as max_seq FROM session_responses WHERE session_id = ?'
      ).get(sessionId);
      const sequence = (maxSeq?.max_seq || 0) + 1;

      // Add to session
      const stmt = this.db.prepare(`
        INSERT INTO session_responses (session_id, response_id, sequence)
        VALUES (?, ?, ?)
      `);
      stmt.run(sessionId, responseId, sequence);

      // Update session updated_at
      this.db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?')
        .run(Date.now(), sessionId);
    } catch (error) {
      throw new Error(`Failed to add response to session: ${error.message}`);
    }
  }

  _tagResponse(responseId, tags) {
    try {
      tags.forEach(tagName => {
        // Get or create tag
        let tag = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName);

        if (!tag) {
          const stmt = this.db.prepare('INSERT INTO tags (name, created_at) VALUES (?, ?)');
          const result = stmt.run(tagName, Date.now());
          tag = { id: result.lastInsertRowid };
        }

        // Add tag to response
        const stmt = this.db.prepare(`
          INSERT OR IGNORE INTO response_tags (response_id, tag_id)
          VALUES (?, ?)
        `);
        stmt.run(responseId, tag.id);
      });
    } catch (error) {
      throw new Error(`Failed to tag response: ${error.message}`);
    }
  }

  _cleanupOldVersions(promptHash) {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM responses
        WHERE prompt_hash = ?
        AND version NOT IN (
          SELECT version FROM responses
          WHERE prompt_hash = ?
          ORDER BY version DESC
          LIMIT ?
        )
      `);
      stmt.run(promptHash, promptHash, this.options.maxHistoryPerPrompt);
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  _formatExport(responses, format) {
    if (format === 'json') {
      return {
        exportedAt: new Date().toISOString(),
        count: responses.length,
        responses: responses.map(r => ({
          id: r.id,
          prompt: r.prompt,
          platform: r.platform,
          model: r.model,
          text: r.text,
          tokens: r.tokens,
          createdAt: r.createdAt,
          metadata: r.metadata
        }))
      };
    } else if (format === 'csv') {
      let csv = 'ID,Prompt,Platform,Model,Response,Tokens In,Tokens Out,Created At\n';
      responses.forEach(r => {
        csv += `"${r.id}","${this._escapeCsv(r.prompt)}","${r.platform}","${r.model}",`;
        csv += `"${this._escapeCsv(r.text)}",${r.tokens.input},${r.tokens.output},"${r.createdAt}"\n`;
      });
      return csv;
    } else if (format === 'markdown') {
      let md = '# Response Export\n\n';
      md += `Exported: ${new Date().toLocaleString()}\n`;
      md += `Total: ${responses.length} responses\n\n`;

      responses.forEach((r, idx) => {
        md += `## Response ${idx + 1}\n\n`;
        md += `- **Platform:** ${r.platform}\n`;
        md += `- **Model:** ${r.model}\n`;
        md += `- **Created:** ${r.createdAt.toLocaleString()}\n`;
        md += `- **Tokens:** ${r.tokens.input} in / ${r.tokens.output} out\n\n`;
        md += `### Prompt\n\n${r.prompt}\n\n`;
        md += `### Response\n\n${r.text}\n\n`;
        md += '---\n\n';
      });

      return md;
    }

    return responses;
  }

  _escapeCsv(text) {
    return text.replace(/"/g, '""').replace(/\n/g, ' ');
  }
}

module.exports = ResponseStorage;
