# FlareSolverr Integration Test Plan

## Objective
Verify that the FlareSolverr integration successfully bypasses Cloudflare and enables full end-to-end AI query functionality in the streamlined orchestrator.

## Prerequisites
- [x] FlareSolverr Docker container running on localhost:8191
- [x] flaresolverr-client.js module created and tested standalone
- [x] streamlined-orchestrator.js updated with FlareSolverr integration
- [x] orchestrator-api-service.js wraps the orchestrator

## Test Scenarios

### 1. FlareSolverr Availability Test
**Objective:** Verify FlareSolverr service is running and accessible

**Steps:**
1. Check FlareSolverr container status
2. Test FlareSolverr health endpoint
3. Verify version and userAgent response

**Expected Results:**
- Docker container status: "Up"
- GET http://localhost:8191/ returns `{"msg": "FlareSolverr is ready!"}`
- Version and userAgent fields present

**Actual Results:** TBD

---

### 2. Standalone FlareSolverr Bypass Test
**Objective:** Verify FlareSolverr can independently bypass Cloudflare on lmarena.ai

**Steps:**
1. Run `node flaresolverr-client.js` demo
2. Observe challenge solving for https://lmarena.ai
3. Check cookies received (cf_clearance, __cf_bm)
4. Verify HTML content returned (not Cloudflare challenge page)

**Expected Results:**
- Challenge solved in 10-20 seconds
- Minimum 2 cookies received (cf_clearance, __cf_bm)
- HTML content length > 100KB
- No "Please unblock challenges.cloudflare.com" error

**Actual Results:**
✅ Already verified - 12.3 seconds, 2 cookies, 190KB content

---

### 3. Orchestrator Initialization Test
**Objective:** Verify orchestrator initializes with FlareSolverr integration

**Steps:**
1. Start orchestrator with `node streamlined-orchestrator.js`
2. Observe initialization logs
3. Check browser launch
4. Verify platform initialization (LMArena, ISH)

**Expected Results:**
- Browser launches successfully
- LMArena platform initializes with FlareSolverr client
- ISH platform initializes
- No initialization errors

**Actual Results:** TBD

---

### 4. Single Query Test (Claude 3.5 Sonnet)
**Objective:** Test full query workflow with Cloudflare bypass

**Steps:**
1. Initialize orchestrator
2. Execute query: `{ prompt: "What is 2+2? Answer in one word.", model: "claude-3.5-sonnet", type: "text" }`
3. Monitor logs for:
   - FlareSolverr challenge solving
   - Cookie acquisition
   - Page navigation
   - Input finding
   - Prompt submission
   - Response extraction

**Expected Results:**
- FlareSolverr bypasses Cloudflare (10-20s)
- Cookies added to browser context
- LMArena page loads without Cloudflare challenge
- Input element found and filled
- Response extracted successfully
- Response contains "Four" or "4"

**Actual Results:** TBD

**Success Criteria:**
- [ ] No Cloudflare error in page content
- [ ] Response is not empty string
- [ ] Response contains valid answer
- [ ] Total query time < 60 seconds

---

### 5. Multiple Model Test
**Objective:** Test query workflow across different models

**Models to Test:**
1. claude-3.5-sonnet (Primary)
2. gpt-4-turbo (OpenAI)
3. deepseek-coder-v2 (Coding specialist)

**Query:** "What is the capital of France? Answer in one word."

**Expected Results:**
- All three queries succeed
- All responses contain "Paris"
- Cookie reuse after first bypass (faster subsequent queries)

**Actual Results:** TBD

---

### 6. Cookie Persistence Test
**Objective:** Verify cookies are reused to avoid repeated FlareSolverr calls

**Steps:**
1. Execute first query (triggers FlareSolverr)
2. Execute second query immediately after
3. Check logs to see if FlareSolverr is called again

**Expected Results:**
- First query: "Using FlareSolverr to bypass Cloudflare..."
- Second query: "Reusing existing Cloudflare cookies"
- Second query is significantly faster (no 10-20s FlareSolverr delay)

**Actual Results:** TBD

---

### 7. API Service Integration Test
**Objective:** Test HTTP API with FlareSolverr integration

**Steps:**
1. Start API service: `node orchestrator-api-service.js`
2. Test endpoints:
   - GET /health
   - GET /models
   - GET /status
   - POST /query with claude-3.5-sonnet

**Expected Results:**
- Health endpoint returns 200 OK
- Models endpoint lists 13 curated models
- Query endpoint successfully executes query with Cloudflare bypass
- Response JSON contains actual AI response

**Actual Results:** TBD

---

### 8. Error Handling Test
**Objective:** Verify graceful error handling when FlareSolverr fails

**Steps:**
1. Stop FlareSolverr Docker container
2. Attempt query
3. Check error messages and fallback behavior

**Expected Results:**
- Orchestrator logs "FlareSolverr failed, trying direct..."
- Query attempts direct navigation (may fail at Cloudflare)
- Error is caught and returned properly
- No uncaught exceptions

**Actual Results:** TBD

---

### 9. Concurrent Query Test
**Objective:** Test orchestrator handles concurrent queries properly

**Steps:**
1. Initialize orchestrator
2. Submit 3 queries simultaneously (different models)
3. Monitor resource usage and responses

**Expected Results:**
- All queries complete successfully
- No race conditions or conflicts
- Responses are properly associated with correct models
- Memory usage reasonable (<500MB per browser context)

**Actual Results:** TBD

---

### 10. Long-Running Stability Test
**Objective:** Verify orchestrator maintains stability over extended operation

**Steps:**
1. Start orchestrator
2. Execute 10 queries over 30 minutes
3. Monitor for memory leaks, cookie expiration, errors

**Expected Results:**
- All 10 queries succeed
- Memory usage remains stable
- Cookies remain valid (or are refreshed when expired)
- No degradation in performance

**Actual Results:** TBD

---

## Test Execution Plan

### Phase 1: Component Tests (15 minutes)
1. FlareSolverr Availability Test
2. Standalone FlareSolverr Bypass Test ✅ (Already completed)
3. Orchestrator Initialization Test

### Phase 2: Core Functionality Tests (20 minutes)
4. Single Query Test (Claude 3.5 Sonnet)
5. Multiple Model Test
6. Cookie Persistence Test

### Phase 3: Integration Tests (15 minutes)
7. API Service Integration Test
8. Error Handling Test

### Phase 4: Stress Tests (30 minutes)
9. Concurrent Query Test
10. Long-Running Stability Test

**Total Estimated Time:** 80 minutes

---

## Success Metrics

**Critical (Must Pass):**
- [ ] FlareSolverr successfully bypasses Cloudflare on lmarena.ai
- [ ] Single query returns valid AI response (not empty)
- [ ] No "Please unblock challenges.cloudflare.com" errors

**Important (Should Pass):**
- [ ] Cookie reuse works (faster subsequent queries)
- [ ] Multiple models work correctly
- [ ] API service integration works end-to-end

**Nice to Have (Good to Pass):**
- [ ] Concurrent queries work
- [ ] Long-running stability maintained
- [ ] Graceful error handling

---

## Risk Assessment

### High Risk Issues:
1. **Cloudflare Detection Evolution** - Cloudflare may detect FlareSolverr's Chrome instance
   - Mitigation: Monitor for new bypass techniques, update FlareSolverr regularly

2. **Cookie Expiration** - cf_clearance cookies may expire during operation
   - Mitigation: Implement automatic cookie refresh on expiration detection

3. **Rate Limiting** - LMArena may rate-limit requests even with valid cookies
   - Mitigation: Implement request throttling and backoff

### Medium Risk Issues:
1. **FlareSolverr Performance** - 10-20 second overhead per challenge
   - Mitigation: Cookie reuse reduces frequency of challenges

2. **Memory Usage** - FlareSolverr uses ~500MB per session
   - Mitigation: Session cleanup and resource monitoring

### Low Risk Issues:
1. **Selector Changes** - LMArena may change UI selectors
   - Mitigation: Multiple selector strategies already implemented

---

## Rollback Plan

If FlareSolverr integration causes issues:
1. Disable FlareSolverr: Set `useFlareSolverr: false` in config
2. Revert to direct navigation (will hit Cloudflare but code remains functional)
3. Fall back to ISH platform (backup platform)

---

## Next Steps After Testing

Based on test results:

**If All Tests Pass (✅):**
- Install as systemd service
- Enable production use
- Monitor for Cloudflare changes

**If Core Tests Pass, Stress Tests Fail (⚠️):**
- Use in limited capacity
- Implement rate limiting
- Add session management improvements

**If Core Tests Fail (❌):**
- Investigate Cloudflare detection methods
- Research alternative bypass techniques
- Consider residential proxy integration

---

## Test Execution Log

### Test Run #1 - [Date/Time]
**Executor:** Automated via agents
**Environment:** /home/gary/ish-automation
**FlareSolverr Version:** Latest (Docker)
**Node.js Version:** v20.19.5
**Orchestrator Version:** Streamlined with FlareSolverr integration

**Results:** TBD

---

## Appendix: Manual Test Commands

```bash
# 1. Check FlareSolverr
docker ps | grep flaresolverr
curl http://localhost:8191/

# 2. Test FlareSolverr standalone
node flaresolverr-client.js

# 3. Test orchestrator with demo
node streamlined-orchestrator.js

# 4. Test API service
node orchestrator-api-service.js &
sleep 30
curl http://localhost:8765/health
curl http://localhost:8765/models
curl -X POST http://localhost:8765/query \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is 2+2?", "model": "claude-3.5-sonnet"}'

# 5. Check logs
tail -f logs/orchestrator-api.log
```
