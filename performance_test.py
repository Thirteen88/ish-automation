#!/usr/bin/env python3
"""
Performance testing for ISH Chat backend
"""
import asyncio
import aiohttp
import time
import statistics
from typing import List, Dict
import json

class ISHChatPerformanceTester:
    def __init__(self, base_url: str = "http://localhost:8000", api_key: str = "ish-chat-secure-key-2024"):
        self.base_url = base_url
        self.api_key = api_key
        self.headers = {
            "Content-Type": "application/json",
            "X-API-Key": api_key
        }
    
    async def single_request(self, session: aiohttp.ClientSession, endpoint: str, method: str = "GET", data: dict = None) -> Dict:
        """Make a single request and return performance metrics"""
        url = f"{self.base_url}{endpoint}"
        start_time = time.time()
        
        try:
            if method == "GET":
                async with session.get(url, headers=self.headers) as response:
                    await response.text()
                    status = response.status
            elif method == "POST":
                async with session.post(url, headers=self.headers, json=data) as response:
                    await response.text()
                    status = response.status
            
            end_time = time.time()
            response_time = (end_time - start_time) * 1000  # Convert to milliseconds
            
            return {
                "status": status,
                "response_time": response_time,
                "success": 200 <= status < 300
            }
        except Exception as e:
            end_time = time.time()
            response_time = (end_time - start_time) * 1000
            return {
                "status": 0,
                "response_time": response_time,
                "success": False,
                "error": str(e)
            }
    
    async def test_endpoint(self, endpoint: str, method: str = "GET", data: dict = None, concurrent_requests: int = 10) -> Dict:
        """Test an endpoint with concurrent requests"""
        print(f"\n🔍 Testing {method} {endpoint} with {concurrent_requests} concurrent requests...")
        
        async with aiohttp.ClientSession() as session:
            tasks = []
            for _ in range(concurrent_requests):
                task = self.single_request(session, endpoint, method, data)
                tasks.append(task)
            
            results = await asyncio.gather(*tasks)
            
            # Calculate statistics
            response_times = [r["response_time"] for r in results]
            successful_requests = [r for r in results if r["success"]]
            
            return {
                "endpoint": endpoint,
                "method": method,
                "total_requests": len(results),
                "successful_requests": len(successful_requests),
                "failed_requests": len(results) - len(successful_requests),
                "success_rate": len(successful_requests) / len(results) * 100,
                "avg_response_time": statistics.mean(response_times),
                "min_response_time": min(response_times),
                "max_response_time": max(response_times),
                "median_response_time": statistics.median(response_times),
                "p95_response_time": sorted(response_times)[int(len(response_times) * 0.95)],
                "requests_per_second": len(results) / (sum(response_times) / 1000)
            }
    
    async def run_performance_tests(self):
        """Run comprehensive performance tests"""
        print("🚀 Starting ISH Chat Backend Performance Tests")
        print("=" * 60)
        
        test_cases = [
            # Health check
            {
                "endpoint": "/health",
                "method": "GET",
                "concurrent_requests": 20
            },
            # Message relay
            {
                "endpoint": "/api/relay",
                "method": "POST",
                "data": {
                    "sender": "user",
                    "message": "Performance test message",
                    "timestamp": "2025-11-04T14:20:00Z",
                    "metadata": {"test": True}
                },
                "concurrent_requests": 10
            },
            # Android status
            {
                "endpoint": "/api/android/status",
                "method": "GET",
                "concurrent_requests": 5
            },
            # ADB command execution
            {
                "endpoint": "/api/android/execute?command=devices",
                "method": "POST",
                "concurrent_requests": 3
            }
        ]
        
        results = []
        
        for test_case in test_cases:
            result = await self.test_endpoint(**test_case)
            results.append(result)
            
            # Print results
            print(f"✅ {test_case['method']} {test_case['endpoint']}")
            print(f"   Success Rate: {result['success_rate']:.1f}% ({result['successful_requests']}/{result['total_requests']})")
            print(f"   Avg Response Time: {result['avg_response_time']:.2f}ms")
            print(f"   Min/Max: {result['min_response_time']:.2f}ms / {result['max_response_time']:.2f}ms")
            print(f"   95th Percentile: {result['p95_response_time']:.2f}ms")
            print(f"   Requests/sec: {result['requests_per_second']:.2f}")
        
        # Summary
        print("\n📊 Performance Test Summary")
        print("=" * 60)
        total_requests = sum(r["total_requests"] for r in results)
        total_successful = sum(r["successful_requests"] for r in results)
        overall_success_rate = (total_successful / total_requests * 100) if total_requests > 0 else 0
        
        avg_response_times = [r["avg_response_time"] for r in results]
        overall_avg_response_time = statistics.mean(avg_response_times)
        
        print(f"Overall Success Rate: {overall_success_rate:.1f}%")
        print(f"Overall Average Response Time: {overall_avg_response_time:.2f}ms")
        print(f"Total Requests Processed: {total_requests}")
        
        # Performance rating
        if overall_avg_response_time < 100:
            rating = "🟢 Excellent"
        elif overall_avg_response_time < 300:
            rating = "🟡 Good"
        elif overall_avg_response_time < 1000:
            rating = "🟠 Fair"
        else:
            rating = "🔴 Poor"
        
        print(f"Performance Rating: {rating}")
        
        return results

async def main():
    """Main performance test runner"""
    tester = ISHChatPerformanceTester()
    results = await tester.run_performance_tests()
    
    # Save results to file
    with open("performance_results.json", "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"\n💾 Detailed results saved to performance_results.json")

if __name__ == "__main__":
    asyncio.run(main())