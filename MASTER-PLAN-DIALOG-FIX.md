# 🎯 Master Plan: Terms Dialog Fix & Production Deployment

**Objective:** Fix LMArena Terms of Use dialog blocking issue and deploy production-ready orchestrator

**Timeline:** 2-4 hours

**Status:** PLANNING PHASE

---

## 📋 Executive Summary

### Current State
- ✅ FlareSolverr bypasses Cloudflare (100% success)
- ✅ Infrastructure complete and tested
- ❌ Terms dialog blocks AI response extraction (CRITICAL)

### Goal State
- ✅ Terms dialog automatically dismissed
- ✅ AI responses successfully extracted
- ✅ All tests passing
- ✅ Service deployed to production systemd

### Approach
Use **parallel agents** to implement multiple dialog handling solutions simultaneously, test all approaches, select the best one, and deploy.

---

## 🔀 Parallel Agent Architecture

```
Master Orchestrator
│
├─── Agent 1: Solution A Implementation (JavaScript Click)
│    ├─── Sub-agent 1.1: Code Implementation
│    └─── Sub-agent 1.2: Unit Testing
│
├─── Agent 2: Solution B Implementation (Explicit Wait + Force Click)
│    ├─── Sub-agent 2.1: Code Implementation
│    └─── Sub-agent 2.2: Unit Testing
│
├─── Agent 3: Solution C Implementation (Cookie Persistence)
│    ├─── Sub-agent 3.1: Cookie Manager Module
│    ├─── Sub-agent 3.2: File System Integration
│    └─── Sub-agent 3.3: Integration Testing
│
├─── Agent 4: Solution D Implementation (Response Extraction Improvement)
│    ├─── Sub-agent 4.1: Selector Enhancement
│    └─── Sub-agent 4.2: Dialog Filtering
│
└─── Agent 5: Integration & Deployment
     ├─── Sub-agent 5.1: End-to-End Testing
     ├─── Sub-agent 5.2: Performance Validation
     └─── Sub-agent 5.3: Production Deployment
```

---

## 🎯 Phase 1: Parallel Solution Implementation (60 minutes)

### Agent 1: Solution A - JavaScript Direct Click
**Priority:** P0 (HIGHEST)
**Owner:** Agent 1
**Timeline:** 15 minutes

#### Sub-agent 1.1: Implementation
**Task:** Implement JavaScript click approach in streamlined-orchestrator.js

**Location:** LMArenaAutomation.query() method, after page.goto()

**Code to Add:**
```javascript
// Step 3: Dismiss Terms of Use dialog if present
try {
    // Wait briefly for dialog to appear
    await this.page.waitForTimeout(2000);

    // Check if dialog exists
    const dialogExists = await this.page.evaluate(() => {
        return document.querySelector('[role="dialog"]') !== null;
    });

    if (dialogExists) {
        console.log('  📋 Terms of Use dialog detected');

        // Use JavaScript to find and click Agree button
        const clicked = await this.page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const agreeButton = buttons.find(btn =>
                btn.textContent.toLowerCase().includes('agree')
            );

            if (agreeButton) {
                agreeButton.click();
                return true;
            }
            return false;
        });

        if (clicked) {
            console.log('  ✅ Terms accepted via JavaScript click');
            await this.page.waitForTimeout(2000); // Wait for dialog to close
        } else {
            console.log('  ⚠️ Agree button not found');
        }
    } else {
        console.log('  ✓ No Terms dialog present');
    }
} catch (error) {
    console.log(`  ⚠️ Terms dialog handling error: ${error.message}`);
}
```

**Deliverable:** Modified streamlined-orchestrator.js with Solution A

#### Sub-agent 1.2: Unit Testing
**Task:** Test Solution A in isolation

**Test Commands:**
```bash
# Test with orchestrator demo
HEADLESS=true timeout 60 node streamlined-orchestrator.js 2>&1 | tee /tmp/test-solution-a.log

# Check for success indicators
grep "Terms accepted via JavaScript click" /tmp/test-solution-a.log
grep -v "By clicking \"Agree\"" /tmp/test-solution-a.log | grep -i "four\|4"
```

**Success Criteria:**
- ✅ "Terms accepted via JavaScript click" appears in log
- ✅ Response contains "Four" or "4", not dialog text
- ✅ Screenshot shows chat interface, not dialog

**Deliverable:** Test results log and validation

---

### Agent 2: Solution B - Explicit Wait + Force Click
**Priority:** P1 (HIGH)
**Owner:** Agent 2
**Timeline:** 20 minutes

#### Sub-agent 2.1: Implementation
**Task:** Implement explicit wait and force click approach

**Alternative Code:**
```javascript
// Step 3: Dismiss Terms dialog with explicit waits
try {
    console.log('  🔍 Checking for Terms dialog...');

    // Wait for dialog with timeout
    await this.page.waitForSelector('[role="dialog"]', {
        timeout: 5000
    });

    console.log('  📋 Terms dialog detected');

    // Wait for Agree button to be visible
    await this.page.waitForSelector('button', {
        state: 'visible',
        timeout: 3000
    });

    // Find button with text matching "Agree"
    const buttons = await this.page.$$('button');
    let agreeButton = null;

    for (const button of buttons) {
        const text = await button.textContent();
        if (text.toLowerCase().includes('agree')) {
            agreeButton = button;
            break;
        }
    }

    if (agreeButton) {
        // Try force click
        await agreeButton.click({ force: true });
        console.log('  ✅ Terms accepted via force click');

        // Wait for dialog to close
        await this.page.waitForSelector('[role="dialog"]', {
            state: 'hidden',
            timeout: 5000
        });
    }
} catch (error) {
    if (error.message.includes('Timeout')) {
        console.log('  ✓ No Terms dialog found');
    } else {
        console.log(`  ⚠️ Dialog handling error: ${error.message}`);
    }
}
```

**Deliverable:** Alternative implementation in streamlined-orchestrator-solution-b.js

#### Sub-agent 2.2: Unit Testing
**Task:** Test Solution B

**Test Commands:**
```bash
# Copy orchestrator with Solution B
cp streamlined-orchestrator.js streamlined-orchestrator-solution-b.js
# (Apply Solution B code)

# Test
HEADLESS=true timeout 60 node streamlined-orchestrator-solution-b.js 2>&1 | tee /tmp/test-solution-b.log
```

**Deliverable:** Test results comparison with Solution A

---

### Agent 3: Solution C - Cookie Persistence System
**Priority:** P1 (HIGH - Long-term solution)
**Owner:** Agent 3
**Timeline:** 30 minutes

#### Sub-agent 3.1: Cookie Manager Module
**Task:** Create cookie-manager.js module

**File:** `/home/gary/ish-automation/cookie-manager.js`

**Code:**
```javascript
const fs = require('fs').promises;
const path = require('path');

class CookieManager {
    constructor(cookieDir = '.cookies') {
        this.cookieDir = path.resolve(cookieDir);
    }

    async ensureCookieDir() {
        try {
            await fs.mkdir(this.cookieDir, { recursive: true });
        } catch (error) {
            // Directory already exists
        }
    }

    async saveCookies(domain, cookies) {
        await this.ensureCookieDir();
        const filePath = path.join(this.cookieDir, `${domain}.json`);
        await fs.writeFile(filePath, JSON.stringify({
            domain,
            timestamp: new Date().toISOString(),
            cookies
        }, null, 2));
        console.log(`  💾 Saved ${cookies.length} cookies to ${filePath}`);
    }

    async loadCookies(domain) {
        const filePath = path.join(this.cookieDir, `${domain}.json`);
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const parsed = JSON.parse(data);
            console.log(`  📂 Loaded ${parsed.cookies.length} cookies from ${filePath}`);
            return parsed.cookies;
        } catch (error) {
            console.log(`  ℹ️  No saved cookies found for ${domain}`);
            return null;
        }
    }

    async hasCookies(domain) {
        const filePath = path.join(this.cookieDir, `${domain}.json`);
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async deleteCookies(domain) {
        const filePath = path.join(this.cookieDir, `${domain}.json`);
        try {
            await fs.unlink(filePath);
            console.log(`  🗑️  Deleted cookies for ${domain}`);
        } catch {
            // File doesn't exist
        }
    }
}

module.exports = CookieManager;
```

**Deliverable:** cookie-manager.js module

#### Sub-agent 3.2: File System Integration
**Task:** Integrate CookieManager into streamlined-orchestrator.js

**Changes:**
1. Add import: `const CookieManager = require('./cookie-manager');`
2. Add to constructor: `this.cookieManager = new CookieManager();`
3. Add cookie loading in initializePlatforms()
4. Add cookie saving after successful Terms acceptance

**Code Integration:**
```javascript
// In initializePlatforms(), after context creation
const savedCookies = await this.cookieManager.loadCookies('lmarena');
if (savedCookies) {
    await context.addCookies(savedCookies);
    console.log('  🍪 Loaded saved cookies');
}

// After Terms dialog accepted successfully
const allCookies = await this.page.context().cookies();
await this.cookieManager.saveCookies('lmarena', allCookies);
```

**Deliverable:** Integration code changes

#### Sub-agent 3.3: Integration Testing
**Task:** Test complete cookie persistence flow

**Test Scenario:**
1. First run: Accept Terms, save cookies
2. Second run: Load cookies, no Terms dialog
3. Verify response quality in both runs

**Deliverable:** Test results showing cookie reuse

---

### Agent 4: Solution D - Response Extraction Improvement
**Priority:** P2 (MEDIUM)
**Owner:** Agent 4
**Timeline:** 20 minutes

#### Sub-agent 4.1: Selector Enhancement
**Task:** Improve response extraction selectors to avoid dialog text

**Enhanced Selectors:**
```javascript
// In query() method, response extraction section
const response = await this.page.evaluate(() => {
    // Strategy 1: Look for specific chat message containers
    const chatSelectors = [
        '[data-testid="message-content"]',
        '[class*="markdown-body"]',
        '[class*="prose"]',
        'div[class*="message"]:not([role="dialog"] *)',
        'div[class*="response"]:not([role="dialog"] *)'
    ];

    for (const sel of chatSelectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
            // Get last message (most recent)
            const lastEl = els[els.length - 1];
            const text = lastEl.textContent.trim();

            // Validate it's not dialog text
            if (text &&
                text.length > 0 &&
                !text.includes('Terms of Use') &&
                !text.includes('Privacy Policy') &&
                !text.includes('clicking "Agree"')) {
                return text;
            }
        }
    }

    // Strategy 2: Find text nodes in chat area
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                // Skip if inside dialog
                const parent = node.parentElement;
                if (parent.closest('[role="dialog"]') ||
                    parent.closest('[class*="modal"]')) {
                    return NodeFilter.FILTER_REJECT;
                }

                // Accept if has meaningful text
                const text = node.textContent.trim();
                if (text.length > 10 &&
                    !text.includes('Terms of Use')) {
                    return NodeFilter.FILTER_ACCEPT;
                }
                return NodeFilter.FILTER_REJECT;
            }
        }
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
        textNodes.push(node.textContent.trim());
    }

    // Return last substantial text
    return textNodes.length > 0 ? textNodes[textNodes.length - 1] : '';
});
```

**Deliverable:** Enhanced response extraction code

#### Sub-agent 4.2: Dialog Filtering
**Task:** Add robust dialog detection and filtering

**Code:**
```javascript
// After response extraction
if (response) {
    // Validate response is not from dialog
    const isDialogText =
        response.includes('Terms of Use') ||
        response.includes('Privacy Policy') ||
        response.includes('clicking "Agree"') ||
        response.includes('Do not submit to our Services');

    if (isDialogText) {
        console.log('  ⚠️ Response appears to be dialog text, retrying...');
        await this.page.waitForTimeout(5000);

        // Try extraction again
        const retryResponse = await this.page.evaluate(() => {
            // ... (same extraction logic)
        });

        return retryResponse;
    }
}
```

**Deliverable:** Dialog filtering logic

---

## 🧪 Phase 2: Parallel Testing (30 minutes)

### Agent 5.1: End-to-End Testing
**Owner:** Sub-agent 5.1
**Timeline:** 20 minutes

**Test Matrix:**

| Solution | Test Case | Expected Result |
|----------|-----------|-----------------|
| A (JS Click) | Single query claude-3.5-sonnet | AI response, not dialog |
| A | Multiple queries (3x) | All succeed, cookies reused |
| B (Force Click) | Single query gpt-4-turbo | AI response, not dialog |
| C (Cookie Persist) | First run + Second run | First: accept Terms, Second: no dialog |
| D (Enhanced Extract) | Query with fallback | Correct response extracted |

**Test Commands:**
```bash
# Test Solution A
HEADLESS=true timeout 60 node streamlined-orchestrator.js > /tmp/e2e-solution-a.log 2>&1

# Test Solution B
HEADLESS=true timeout 60 node streamlined-orchestrator-solution-b.js > /tmp/e2e-solution-b.log 2>&1

# Test Solution C (two runs)
HEADLESS=true timeout 60 node streamlined-orchestrator.js > /tmp/e2e-solution-c-run1.log 2>&1
HEADLESS=true timeout 60 node streamlined-orchestrator.js > /tmp/e2e-solution-c-run2.log 2>&1
```

**Validation:**
```bash
# Check for success indicators
grep -i "four\|4" /tmp/e2e-solution-*.log
grep "Terms accepted" /tmp/e2e-solution-*.log
grep -v "By clicking" /tmp/e2e-solution-*.log | grep -i "response:"
```

**Deliverable:** E2E test results matrix

---

### Agent 5.2: Performance Validation
**Owner:** Sub-agent 5.2
**Timeline:** 10 minutes

**Metrics to Collect:**

| Metric | Target | Actual |
|--------|--------|--------|
| FlareSolverr bypass time | 5-15s | TBD |
| Dialog dismissal time | <3s | TBD |
| Total query time | <40s | TBD |
| Response accuracy | 100% | TBD |
| Cookie reuse speed gain | 8s saved | TBD |

**Test Commands:**
```bash
# Run 5 queries and collect timing
for i in {1..5}; do
    echo "=== Query $i ==="
    time HEADLESS=true timeout 60 node streamlined-orchestrator.js 2>&1 | \
        grep -E "duration|bypassed|accepted|response"
done
```

**Deliverable:** Performance metrics report

---

## 🎯 Phase 3: Solution Selection (15 minutes)

### Selection Criteria

| Criterion | Weight | Solution A | Solution B | Solution C | Solution D |
|-----------|--------|------------|------------|------------|------------|
| Success Rate | 40% | TBD | TBD | TBD | TBD |
| Implementation Complexity | 20% | Low (9/10) | Medium (7/10) | High (5/10) | Medium (7/10) |
| Maintainability | 20% | High (8/10) | Medium (7/10) | High (9/10) | High (8/10) |
| Performance | 10% | TBD | TBD | TBD | TBD |
| Long-term Viability | 10% | Medium (6/10) | Medium (6/10) | High (10/10) | High (8/10) |

### Decision Matrix

**If Solution A succeeds:**
- Use Solution A as primary
- Add Solution C (cookie persistence) as enhancement
- Deploy to production

**If Solution A fails, Solution B succeeds:**
- Use Solution B as primary
- Add Solution C as enhancement
- Deploy to production

**If both A and B fail:**
- Use Solution C (manual first-time acceptance required)
- Add Solution D for better extraction
- Deploy with documented limitation

**If all fail:**
- Fall back to ISH platform
- Document manual Terms acceptance requirement
- Continue research for alternative approaches

---

## 🚀 Phase 4: Production Deployment (30 minutes)

### Agent 5.3: Production Deployment
**Owner:** Sub-agent 5.3
**Timeline:** 30 minutes

#### Step 1: Final Code Integration
**Task:** Merge winning solution into main orchestrator

**Actions:**
1. Apply winning solution code to streamlined-orchestrator.js
2. Add cookie persistence (Solution C)
3. Add enhanced extraction (Solution D) as fallback
4. Update version number and changelog
5. Final code review

**Deliverable:** Production-ready streamlined-orchestrator.js

---

#### Step 2: Pre-deployment Testing
**Task:** Run full test suite

**Commands:**
```bash
# Run all Phase 1 tests that weren't completed
cd /home/gary/ish-automation

# Test 5: Multiple Models
HEADLESS=true timeout 90 node streamlined-orchestrator.js # Test 3 different models

# Test 8: Error Handling (stop FlareSolverr first)
docker stop flaresolverr
HEADLESS=true timeout 30 node streamlined-orchestrator.js
docker start flaresolverr

# Test 9: Concurrent Queries (would need separate test script)

# Test 10: Long-running stability (10 queries)
for i in {1..10}; do
    echo "=== Stability Test $i/10 ==="
    HEADLESS=true timeout 60 node streamlined-orchestrator.js
    sleep 5
done
```

**Success Criteria:**
- All queries return valid AI responses
- No crashes or hangs
- Memory usage stable
- Cookies persist correctly

**Deliverable:** Final test results report

---

#### Step 3: Systemd Service Installation
**Task:** Deploy as persistent system service

**Commands:**
```bash
cd /home/gary/ish-automation

# Create logs directory if not exists
mkdir -p logs

# Install service
sudo -E bash install-orchestrator-service-nvm.sh

# Start service
sudo systemctl start orchestrator-api

# Check status
sudo systemctl status orchestrator-api

# Test endpoints
sleep 15  # Wait for initialization
curl http://localhost:8765/health
curl http://localhost:8765/models

# Test query via API
curl -X POST http://localhost:8765/query \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is 2+2? Answer in one word.",
    "model": "claude-3.5-sonnet"
  }'

# Enable auto-start on boot
sudo systemctl enable orchestrator-api
```

**Success Criteria:**
- Service starts without errors
- All endpoints respond correctly
- Query returns valid AI response
- Service auto-restarts after crashes

**Deliverable:** Running production service

---

#### Step 4: Monitoring Setup
**Task:** Set up basic monitoring

**Log Monitoring:**
```bash
# Monitor service logs
tail -f ~/ish-automation/logs/orchestrator-api.log

# Monitor error logs
tail -f ~/ish-automation/logs/orchestrator-api-error.log

# Monitor system journal
sudo journalctl -u orchestrator-api -f
```

**Health Checks:**
```bash
# Create health check script
cat > ~/ish-automation/health-check.sh << 'EOF'
#!/bin/bash
RESPONSE=$(curl -s http://localhost:8765/health)
if echo "$RESPONSE" | grep -q "healthy"; then
    echo "✅ Service is healthy"
    exit 0
else
    echo "❌ Service is unhealthy"
    echo "$RESPONSE"
    exit 1
fi
EOF

chmod +x ~/ish-automation/health-check.sh

# Add to crontab (check every 5 minutes)
(crontab -l 2>/dev/null; echo "*/5 * * * * /home/gary/ish-automation/health-check.sh >> /home/gary/ish-automation/logs/health-check.log 2>&1") | crontab -
```

**Deliverable:** Monitoring setup complete

---

#### Step 5: Documentation Update
**Task:** Update documentation with production details

**Files to Update:**
1. README.md (if exists) - Add production deployment section
2. INSTALLATION-COMPLETE.md - Mark as production-deployed
3. Create PRODUCTION-DEPLOYMENT.md with:
   - Service details
   - Monitoring commands
   - Troubleshooting guide
   - Maintenance procedures

**Deliverable:** Updated documentation

---

## 📊 Success Criteria Summary

### Critical Success Factors
- [ ] Terms dialog automatically dismissed (any solution)
- [ ] AI responses extracted correctly (not dialog text)
- [ ] Response accuracy: 100% for test queries
- [ ] Service starts and runs without crashes
- [ ] All API endpoints functional

### Performance Targets
- [ ] Query time: <40 seconds (including bypass)
- [ ] Dialog dismissal: <3 seconds
- [ ] Cookie reuse: Saves ~8 seconds per query
- [ ] API response time: <100ms (info endpoints)

### Production Readiness
- [ ] Systemd service installed and running
- [ ] Auto-restart enabled
- [ ] Logging configured
- [ ] Health monitoring active
- [ ] Documentation complete

---

## 🎯 Agent Task Assignments

### Parallel Phase (All run simultaneously)

**Agent 1: Solution A (JavaScript Click)**
- Sub-agent 1.1: Implement JS click → 10 min
- Sub-agent 1.2: Test solution → 5 min
- **Total:** 15 minutes

**Agent 2: Solution B (Force Click)**
- Sub-agent 2.1: Implement force click → 15 min
- Sub-agent 2.2: Test solution → 5 min
- **Total:** 20 minutes

**Agent 3: Solution C (Cookie Persistence)**
- Sub-agent 3.1: Cookie manager module → 15 min
- Sub-agent 3.2: Integration → 10 min
- Sub-agent 3.3: Testing → 5 min
- **Total:** 30 minutes

**Agent 4: Solution D (Extraction Enhancement)**
- Sub-agent 4.1: Selector improvement → 15 min
- Sub-agent 4.2: Dialog filtering → 5 min
- **Total:** 20 minutes

**Maximum parallel time:** 30 minutes (Agent 3)

### Sequential Phase

**Agent 5: Integration & Deployment**
- Sub-agent 5.1: E2E testing → 20 min
- Sub-agent 5.2: Performance validation → 10 min
- Sub-agent 5.3: Production deployment → 30 min
- **Total:** 60 minutes

---

## ⏱️ Timeline Summary

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Implementation | 30 min | None (parallel) |
| Phase 2: Testing | 30 min | Phase 1 complete |
| Phase 3: Selection | 15 min | Phase 2 complete |
| Phase 4: Deployment | 30 min | Phase 3 complete |
| **TOTAL** | **105 min** | Sequential |

**Estimated Total Time:** 1 hour 45 minutes (optimistic)
**With buffer:** 2-3 hours (realistic)

---

## 📋 Pre-flight Checklist

Before starting agent execution:

- [ ] FlareSolverr container running (`docker ps | grep flaresolverr`)
- [ ] Node.js environment ready (`node --version`)
- [ ] Disk space available (`df -h /home/gary`)
- [ ] No port conflicts on 8765 (`lsof -i :8765`)
- [ ] Current code backed up
- [ ] Test plan reviewed and approved
- [ ] All documentation ready for updates

---

## 🚨 Risk Mitigation

### High-Risk Scenarios

**Scenario 1: All solutions fail to dismiss dialog**
- **Mitigation:** Fall back to ISH platform
- **Action:** Implement platform fallback logic
- **Timeline impact:** +30 minutes

**Scenario 2: Cookie persistence breaks**
- **Mitigation:** Disable cookie file loading, use in-memory only
- **Action:** Add feature flag for cookie persistence
- **Timeline impact:** +15 minutes

**Scenario 3: Response extraction still gets dialog text**
- **Mitigation:** Add explicit validation and retry logic
- **Action:** Implement response validation with 3 retry attempts
- **Timeline impact:** +20 minutes

**Scenario 4: Service fails to start**
- **Mitigation:** Debug systemd logs, run manually first
- **Action:** Test manual startup before systemd
- **Timeline impact:** +30 minutes

---

## ✅ Rollback Plan

If deployment fails:

1. **Stop service:**
   ```bash
   sudo systemctl stop orchestrator-api
   sudo systemctl disable orchestrator-api
   ```

2. **Restore previous version:**
   ```bash
   git checkout HEAD^ streamlined-orchestrator.js  # If using git
   # OR
   cp streamlined-orchestrator.js.backup streamlined-orchestrator.js
   ```

3. **Document failure reasons**

4. **Return to planning phase**

---

## 📝 Deliverables Checklist

### Code Deliverables
- [ ] streamlined-orchestrator.js (with winning solution)
- [ ] cookie-manager.js (new module)
- [ ] Solution test files (a, b, c, d variants)

### Test Deliverables
- [ ] TEST-RESULTS-FINAL.md (comprehensive results)
- [ ] Test logs (/tmp/test-*.log)
- [ ] Performance metrics report
- [ ] E2E test validation

### Documentation Deliverables
- [ ] PRODUCTION-DEPLOYMENT.md
- [ ] Updated INSTALLATION-COMPLETE.md
- [ ] Monitoring guide
- [ ] Troubleshooting guide

### Service Deliverables
- [ ] Running systemd service
- [ ] Health monitoring active
- [ ] Log rotation configured
- [ ] Auto-restart enabled

---

## 🎉 Definition of Done

**The project is DONE when:**

1. ✅ User can send query via API
2. ✅ Query bypasses Cloudflare automatically
3. ✅ Terms dialog dismissed automatically
4. ✅ Valid AI response returned (not dialog text)
5. ✅ Service runs as systemd daemon
6. ✅ Service auto-restarts on failure
7. ✅ Health monitoring operational
8. ✅ All documentation updated
9. ✅ User approves deployment

---

**Master Plan Status:** READY FOR REVIEW & EXECUTION

**Next Step:** User reviews and approves plan, then we execute all agents in parallel.
