"""
ISH AI Orchestrator - Python SDK
Official client library for Python applications

@version 1.0.0
@author ISH Automation Team
"""

import requests
import json
import time
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass


@dataclass
class ClientConfig:
    """SDK configuration"""
    api_key: str
    base_url: str = "http://localhost:3000"
    timeout: int = 30


class ISHOrchestratorClient:
    """
    ISH AI Orchestrator Python SDK Client

    Usage:
        client = ISHOrchestratorClient(api_key="your-api-key")
        result = client.query(query="Explain AI", platform="auto")
    """

    def __init__(self, api_key: str = None, base_url: str = "http://localhost:3000",
                 timeout: int = 30, config: ClientConfig = None):
        """
        Initialize the SDK client

        Args:
            api_key: API key for authentication
            base_url: Base URL of the API
            timeout: Request timeout in seconds
            config: ClientConfig object (alternative to individual params)
        """
        if config:
            self.api_key = config.api_key
            self.base_url = config.base_url
            self.timeout = config.timeout
        else:
            if not api_key:
                raise ValueError("API key is required")
            self.api_key = api_key
            self.base_url = base_url
            self.timeout = timeout

        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'X-API-Key': self.api_key
        })

    def _request(self, method: str, endpoint: str, data: Dict = None,
                 params: Dict = None) -> Dict:
        """Make HTTP request"""
        url = f"{self.base_url}{endpoint}"

        try:
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                params=params,
                timeout=self.timeout
            )

            result = response.json()

            if not response.ok:
                error = result.get('error', {})
                raise APIError(
                    message=error.get('message', 'Request failed'),
                    code=error.get('code'),
                    status_code=response.status_code,
                    details=error.get('details')
                )

            return result

        except requests.exceptions.Timeout:
            raise APIError('Request timeout', 'TIMEOUT')
        except requests.exceptions.RequestException as e:
            raise APIError(f'Request failed: {str(e)}', 'REQUEST_ERROR')

    # =========================================================================
    # QUERY METHODS
    # =========================================================================

    def submit_query(self, query: str, platform: str = 'auto',
                     model: str = None, system_prompt: str = None,
                     temperature: float = 0.7, max_tokens: int = 2000,
                     stream: bool = False, metadata: Dict = None) -> Dict:
        """
        Submit a new query

        Args:
            query: The query text
            platform: Platform to use (claude|gpt|gemini|llama|auto)
            model: Specific model (optional)
            system_prompt: System prompt (optional)
            temperature: Temperature (0-2)
            max_tokens: Maximum tokens
            stream: Enable streaming
            metadata: Additional metadata

        Returns:
            Query response with queryId
        """
        params = {
            'query': query,
            'platform': platform,
            'temperature': temperature,
            'maxTokens': max_tokens,
            'stream': stream
        }

        if model:
            params['model'] = model
        if system_prompt:
            params['systemPrompt'] = system_prompt
        if metadata:
            params['metadata'] = metadata

        return self._request('POST', '/v1/query', data=params)

    def get_query(self, query_id: str) -> Dict:
        """
        Get query results

        Args:
            query_id: Query ID

        Returns:
            Query results
        """
        return self._request('GET', f'/v1/query/{query_id}')

    def query(self, query: str, platform: str = 'auto',
              poll_interval: float = 1.0, **kwargs) -> Dict:
        """
        Submit query and wait for completion

        Args:
            query: The query text
            platform: Platform to use
            poll_interval: Polling interval in seconds
            **kwargs: Additional parameters for submit_query

        Returns:
            Completed query result
        """
        response = self.submit_query(query, platform, **kwargs)
        query_id = response['data']['queryId']

        # Poll for completion
        while True:
            result = self.get_query(query_id)
            status = result['data']['status']

            if status == 'completed':
                return result

            if status == 'failed':
                error_msg = result['data'].get('error', {}).get('message', 'Query failed')
                raise APIError(error_msg, 'QUERY_FAILED')

            time.sleep(poll_interval)

    # =========================================================================
    # PLATFORM METHODS
    # =========================================================================

    def list_platforms(self) -> Dict:
        """List all available platforms"""
        return self._request('GET', '/v1/platforms')

    def get_platform(self, platform_name: str) -> Dict:
        """Get platform details"""
        return self._request('GET', f'/v1/platforms/{platform_name}')

    def get_platform_status(self, platform_name: str) -> Dict:
        """Get platform health status"""
        return self._request('GET', f'/v1/platforms/{platform_name}/status')

    def get_platform_models(self, platform_name: str) -> Dict:
        """List platform models"""
        return self._request('GET', f'/v1/platforms/{platform_name}/models')

    # =========================================================================
    # BATCH METHODS
    # =========================================================================

    def submit_batch(self, queries: List[Dict]) -> Dict:
        """
        Submit batch queries

        Args:
            queries: List of query objects with 'id' and 'query' fields

        Returns:
            Batch response with batchId
        """
        return self._request('POST', '/v1/batch', data={'queries': queries})

    def get_batch(self, batch_id: str) -> Dict:
        """Get batch results"""
        return self._request('GET', f'/v1/batch/{batch_id}')

    def cancel_batch(self, batch_id: str) -> Dict:
        """Cancel batch processing"""
        return self._request('POST', f'/v1/batch/{batch_id}/cancel')

    def batch(self, queries: List[Dict], poll_interval: float = 2.0) -> Dict:
        """
        Submit batch and wait for completion

        Args:
            queries: List of query objects
            poll_interval: Polling interval in seconds

        Returns:
            Completed batch results
        """
        response = self.submit_batch(queries)
        batch_id = response['data']['batchId']

        while True:
            result = self.get_batch(batch_id)
            status = result['data']['status']

            if status in ['completed', 'cancelled']:
                return result

            if status == 'failed':
                error_msg = result['data'].get('error', {}).get('message', 'Batch failed')
                raise APIError(error_msg, 'BATCH_FAILED')

            time.sleep(poll_interval)

    # =========================================================================
    # COMPARE METHODS
    # =========================================================================

    def submit_compare(self, query: str, platforms: List[str],
                       system_prompt: str = None) -> Dict:
        """
        Compare responses across platforms

        Args:
            query: Query text
            platforms: List of platform names
            system_prompt: System prompt (optional)

        Returns:
            Comparison response with comparisonId
        """
        params = {'query': query, 'platforms': platforms}
        if system_prompt:
            params['systemPrompt'] = system_prompt

        return self._request('POST', '/v1/compare', data=params)

    def get_compare(self, comparison_id: str) -> Dict:
        """Get comparison results"""
        return self._request('GET', f'/v1/compare/{comparison_id}')

    def compare(self, query: str, platforms: List[str],
                system_prompt: str = None, poll_interval: float = 2.0) -> Dict:
        """
        Compare platforms and wait for completion

        Args:
            query: Query text
            platforms: List of platform names
            system_prompt: System prompt (optional)
            poll_interval: Polling interval in seconds

        Returns:
            Completed comparison results
        """
        response = self.submit_compare(query, platforms, system_prompt)
        comparison_id = response['data']['comparisonId']

        while True:
            result = self.get_compare(comparison_id)
            status = result['data']['status']

            if status == 'completed':
                return result

            if status == 'failed':
                error_msg = result['data'].get('error', {}).get('message', 'Comparison failed')
                raise APIError(error_msg, 'COMPARISON_FAILED')

            time.sleep(poll_interval)

    # =========================================================================
    # STATISTICS METHODS
    # =========================================================================

    def get_stats(self, start_date: str = None, end_date: str = None,
                  group_by: str = 'day', platform: str = None) -> Dict:
        """
        Get usage statistics

        Args:
            start_date: Start date (ISO 8601)
            end_date: End date (ISO 8601)
            group_by: Group by (hour|day|week|month)
            platform: Filter by platform

        Returns:
            Usage statistics
        """
        params = {'groupBy': group_by}
        if start_date:
            params['startDate'] = start_date
        if end_date:
            params['endDate'] = end_date
        if platform:
            params['platform'] = platform

        return self._request('GET', '/v1/stats', params=params)

    def get_stats_summary(self) -> Dict:
        """Get statistics summary"""
        return self._request('GET', '/v1/stats/summary')

    def get_platform_stats(self) -> Dict:
        """Get platform usage breakdown"""
        return self._request('GET', '/v1/stats/platforms')

    def export_stats(self) -> str:
        """Export analytics data as CSV"""
        url = f"{self.base_url}/v1/stats/export"
        response = self.session.get(url, timeout=self.timeout)

        if not response.ok:
            raise APIError('Export failed', 'EXPORT_ERROR')

        return response.text

    # =========================================================================
    # UTILITY METHODS
    # =========================================================================

    def health(self) -> Dict:
        """Check API health"""
        return self._request('GET', '/health')

    def close(self):
        """Close the session"""
        self.session.close()

    def __enter__(self):
        """Context manager entry"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()


class APIError(Exception):
    """API Error exception"""

    def __init__(self, message: str, code: str = None,
                 status_code: int = None, details: Dict = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details


# ============================================================================
# USAGE EXAMPLES
# ============================================================================

def example_1_simple_query():
    """Example 1: Simple Query"""
    with ISHOrchestratorClient(api_key='your-api-key') as client:
        result = client.query(
            query='Explain quantum computing',
            platform='auto'
        )
        print(result['data']['result']['response'])


def example_2_batch_processing():
    """Example 2: Batch Processing"""
    client = ISHOrchestratorClient(api_key='your-api-key')

    queries = [
        {'id': 'q1', 'query': 'What is AI?', 'platform': 'claude'},
        {'id': 'q2', 'query': 'Explain machine learning', 'platform': 'gpt'},
        {'id': 'q3', 'query': 'What is neural network?', 'platform': 'gemini'}
    ]

    result = client.batch(queries)

    for q in result['data']['queries']:
        print(f"{q['id']}: {q['result']['response']}")


def example_3_platform_comparison():
    """Example 3: Platform Comparison"""
    client = ISHOrchestratorClient(api_key='your-api-key')

    result = client.compare(
        query='Write a haiku about programming',
        platforms=['claude', 'gpt', 'gemini']
    )

    for r in result['data']['results']:
        print(f"\n{r['platform']}:\n{r['result']['response']}")

    print("\nRecommendations:", result['data']['summary']['recommendations'])


def example_4_statistics():
    """Example 4: Get Statistics"""
    client = ISHOrchestratorClient(api_key='your-api-key')

    # Get summary
    summary = client.get_stats_summary()
    print("Total requests:", summary['data']['summary']['total'])

    # Get platform breakdown
    platforms = client.get_platform_stats()
    for p in platforms['data']['platforms']:
        print(f"{p['platform']}: {p['totalRequests']} requests")

    # Export to CSV
    csv_data = client.export_stats()
    with open('analytics.csv', 'w') as f:
        f.write(csv_data)


if __name__ == '__main__':
    # Run examples
    print("ISH AI Orchestrator - Python SDK Examples")
    print("=" * 60)

    # Uncomment to run examples
    # example_1_simple_query()
    # example_2_batch_processing()
    # example_3_platform_comparison()
    # example_4_statistics()
