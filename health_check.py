#!/usr/bin/env python3
"""
Health check script for ISH Chat production deployment
"""
import sys
import requests
import time

def check_service_health():
    """Check health of all critical services"""
    services = {
        "ISH Chat Backend": "http://localhost:8000/health",
        "Prometheus": "http://localhost:9090/-/healthy",
        "Grafana": "http://localhost:3000/api/health",
        "PostgreSQL": "http://localhost:5435/health",  # If health check is configured
        "Redis": "http://localhost:6380/health"       # If health check is configured
    }

    results = {}

    for service_name, url in services.items():
        try:
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                results[service_name] = "✅ HEALTHY"
            else:
                results[service_name] = f"❌ UNHEALTHY (Status: {response.status_code})"
        except requests.exceptions.RequestException as e:
            results[service_name] = f"❌ UNREACHABLE ({str(e)[:50]}...)"

    return results

def main():
    """Main health check function"""
    print("🏥 ISH Chat Production Health Check")
    print("=" * 50)

    results = check_service_health()

    all_healthy = True
    for service, status in results.items():
        print(f"{service:20} {status}")
        if "❌" in status:
            all_healthy = False

    print("=" * 50)

    if all_healthy:
        print("✅ All services are healthy!")
        sys.exit(0)
    else:
        print("❌ Some services are unhealthy!")
        sys.exit(1)

if __name__ == "__main__":
    main()