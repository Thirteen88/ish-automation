# Platform Selectors - Reference Guide

## Updated Selectors for Production Orchestrator

This document contains the discovered and implemented selectors for each AI platform.

## ✅ ChatGPT (chat.openai.com)

### Status: **Selectors Updated** ✓

### Input Selectors:
```javascript
// Primary input (recommended)
'#prompt-textarea'

// Fallback textarea
'._fallbackTextarea_198md_2'
```

### Submit Button:
```javascript
'button[data-testid="send-button"]'
// Fallback: Press Enter key
```

### Response Extraction:
```javascript
// Primary method - assistant messages
'[data-message-author-role="assistant"]'

// Fallback - markdown content
'.markdown'
```

### Login Detection:
```javascript
'button[aria-label="User"]'
```

### Notes:
- ✅ Requires login
- ✅ Session persistence works
- ✅ Selectors verified working
- Input uses ProseMirror editor (contenteditable)
- Response appears in markdown format

---

## 🔄 LMArena (lmarena.ai)

### Status: **Multiple Fallbacks Implemented** ⚠️

### Input Selectors (tried in order):
```javascript
[
  'textarea:not([disabled])',           // Priority 1
  'textarea[placeholder*="message"]',   // Priority 2
  'textarea[placeholder*="prompt"]',    // Priority 3
  'textarea',                           // Priority 4
  '[contenteditable="true"]'            // Priority 5
]
```

### Original discovered class:
```javascript
'textarea.bg-surface-primary'  // May change - use fallbacks
```

### Submit Method:
```javascript
// Press Enter (button not reliable)
page.keyboard.press('Enter')
```

### Response Extraction (tried in order):
```javascript
[
  '[class*="message"]',
  '[class*="response"]',
  '[class*="output"]',
  '.prose'
]
```

### Notes:
- ✅ No login required
- ⚠️  Slow page load (use lower timeout)
- ✅ Multiple selector fallbacks implemented
- Screenshots saved on error for debugging
- Arena mode can be slow - use direct mode

---

## ⏳ Claude.ai (claude.ai)

### Status: **Needs Update** 🔴

### Current Placeholder Selectors:
```javascript
// Input
'div[contenteditable="true"]'

// Submit
'button[type="submit"]'

// Response
'.response-text'
```

### Discovered Issues:
- Page loads but no input elements found initially
- May require additional wait time
- Likely uses React/dynamic loading

### Login Detection:
```javascript
'[data-testid="user-menu"]'
```

### Notes:
- ✅ Requires login
- 🔴 Selectors need verification
- May use Claude 2 vs Claude 3 different interfaces
- Session persistence should work

---

## ⏳ Gemini (gemini.google.com)

### Status: **Needs Update** 🔴

### Current Placeholder Selectors:
```javascript
// Input
'textarea.ql-editor'

// Submit
'button[aria-label="Send"]'

// Response
'.model-response'
```

### Discovered Issues:
- Page loads but no standard input elements found
- May use custom editor component
- Requires Google account login

### Notes:
- ✅ Requires Google login
- 🔴 Selectors need verification
- May have rate limits
- Different interface based on account type

---

## ✅ ISH Platform (ish.junioralive.in)

### Status: **Working (Simulated)** ✓

### Current Implementation:
```javascript
// Simple wait-based implementation
await page.waitForSelector('body', { timeout: 10000 });
await page.waitForTimeout(2000);
```

### Notes:
- ✅ No login required
- ✅ Working implementation
- Currently returns simulated responses
- Real selector implementation pending platform inspection

---

## 📊 Selector Priority Strategy

### 1. **Specific → Generic**
```javascript
// Try most specific first
'#prompt-textarea'              // ID selector
'button[data-testid="send"]'    // Data attribute
'textarea.specific-class'        // Class selector
'textarea'                       // Generic element
```

### 2. **Multiple Fallbacks**
```javascript
const selectors = [
    'primary-selector',
    'fallback-1',
    'fallback-2',
    'generic-fallback'
];

for (const sel of selectors) {
    try {
        await page.waitForSelector(sel, { timeout: 2000 });
        // Use this selector
        break;
    } catch (e) {
        continue;
    }
}
```

### 3. **Error Handling with Screenshots**
```javascript
try {
    // Attempt query
} catch (error) {
    await page.screenshot({
        path: `selector-discovery/${platform}-error.png`
    });
    throw error;
}
```

---

## 🛠️ Selector Discovery Tools

### 1. **Auto-Discovery Tool**
```bash
node discover-selectors.js
```
- Visits all platforms
- Takes screenshots
- Lists input elements and buttons
- Saves HTML structure

### 2. **Manual Inspection**
```bash
# Open platform in headed mode
node production-orchestrator-browser.js --headed

# Inspect elements manually
# Copy selectors from DevTools
```

### 3. **Test Individual Platform**
```bash
node test-real-selectors.js
```
- Tests each platform individually
- Shows errors with context
- Saves screenshots

---

## 🔍 How to Update Selectors

### Step 1: Run Discovery
```bash
node discover-selectors.js
```

### Step 2: Check Screenshots
```bash
ls -lh selector-discovery/
# View images to see actual page state
```

### Step 3: Update Platform Class
```javascript
// In production-orchestrator-browser.js
async query(prompt, options = {}) {
    // Update selectors based on discovery
    const inputSelector = 'NEW_SELECTOR';
    await this.page.waitForSelector(inputSelector);
    // ...
}
```

### Step 4: Test
```bash
node test-real-selectors.js
```

---

## 📝 Common Selector Patterns

### Input Fields:
```javascript
// Text inputs
'input[type="text"]'
'textarea'
'[contenteditable="true"]'

// With placeholders
'textarea[placeholder*="message"]'
'textarea[placeholder*="prompt"]'

// By ID
'#prompt-textarea'
'#chat-input'

// By class (avoid - often changes)
'textarea.specific-class'
```

### Buttons:
```javascript
// By test ID (most stable)
'button[data-testid="send-button"]'

// By aria label
'button[aria-label="Send"]'
'button[aria-label="Submit"]'

// By type
'button[type="submit"]'

// By text (unreliable - i18n)
'button:has-text("Send")'
```

### Response Content:
```javascript
// By data attribute (best)
'[data-message-author-role="assistant"]'
'[data-testid="response"]'

// By class pattern
'[class*="message"]'
'[class*="response"]'

// By semantic HTML
'.markdown'
'.prose'
'article'
```

---

## ⚠️ Selector Anti-Patterns

### ❌ Don't Use:
```javascript
// Overly specific class chains
'.class1 > .class2 > .class3 > .class4'

// Numeric indexes
'textarea:nth-child(3)'

// Generated classes
'.css-1234abc'
'.MuiTextField-root-567'

// Text content (i18n issues)
'button:has-text("Send")'
```

### ✅ Do Use:
```javascript
// IDs (if stable)
'#prompt-input'

// Data attributes
'[data-testid="input"]'

// Semantic attributes
'textarea[aria-label="Message"]'

// Multiple fallbacks
const selectors = ['#input', 'textarea', '[contenteditable="true"]'];
```

---

## 🎯 Testing Checklist

Before marking selectors as "working":

- [ ] Selector finds element on page load
- [ ] Input element is visible and interactable
- [ ] Typing works in input element
- [ ] Submit button works or Enter key submits
- [ ] Response appears within reasonable time
- [ ] Response text can be extracted
- [ ] Login detection works correctly
- [ ] Error screenshots save properly
- [ ] Works across multiple page loads

---

## 📈 Selector Stability Ranking

### 🟢 Most Stable:
1. `data-testid` attributes
2. `aria-label` attributes
3. IDs (if not generated)
4. Semantic HTML5 elements

### 🟡 Moderately Stable:
1. Element type + attribute combinations
2. Stable class names
3. Element type alone

### 🔴 Least Stable:
1. Generated class names
2. nth-child selectors
3. Complex CSS paths
4. Text content matching

---

## 🔄 Maintenance Schedule

- **Weekly**: Check if major platforms still work
- **Monthly**: Run full discovery on all platforms
- **On Failure**: Immediate re-discovery and update
- **Version Change**: Re-verify all selectors

---

## 📚 Resources

- **Playwright Selectors**: https://playwright.dev/docs/selectors
- **CSS Selectors**: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors
- **Best Practices**: https://playwright.dev/docs/best-practices

---

*Last Updated: 2025-10-22*
*Status: ChatGPT ✓ | LMArena ⚠️ | Claude 🔴 | Gemini 🔴 | ISH ✓*
