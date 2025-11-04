#!/usr/bin/env python3
"""
Quick test script for ISH Chat CLI Dashboard
Validates imports, configuration, and basic functionality
"""

import sys
import os
import asyncio
from datetime import datetime

# Add current directory to path for imports
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

def test_imports():
    """Test all required imports"""
    print("Testing imports...")

    try:
        from core.config import DashboardConfig
        print("✓ DashboardConfig imported successfully")
    except Exception as e:
        print(f"✗ DashboardConfig import failed: {e}")
        return False

    try:
        from core.dashboard import ISHChatDashboard
        print("✓ ISHChatDashboard imported successfully")
    except Exception as e:
        print(f"✗ ISHChatDashboard import failed: {e}")
        return False

    try:
        from utils.logger import setup_logger
        print("✓ Logger utilities imported successfully")
    except Exception as e:
        print(f"✗ Logger utilities import failed: {e}")
        return False

    return True

def test_dependencies():
    """Test required dependencies"""
    print("\nTesting dependencies...")

    dependencies = [
        ('rich', 'Rich terminal UI'),
        ('aiohttp', 'Async HTTP client'),
        ('pydantic', 'Data validation'),
        ('asyncio', 'Async programming (built-in)'),
    ]

    all_available = True
    for dep, description in dependencies:
        try:
            __import__(dep)
            print(f"✓ {dep}: Available ({description})")
        except ImportError as e:
            print(f"✗ {dep}: Not available - {e}")
            all_available = False

    return all_available

def test_configuration():
    """Test configuration system"""
    print("\nTesting configuration...")

    try:
        from core.config import DashboardConfig

        # Test default configuration
        config = DashboardConfig()
        print(f"✓ Default config created successfully")
        print(f"  - Refresh rate: {config.refresh_rate}s")
        print(f"  - API URL: {config.api_base_url}")
        print(f"  - Debug mode: {config.debug}")
        print(f"  - Simulation mode: {config.simulate_data}")

        # Test configuration modifications
        config.simulate_data = True
        config.debug = True
        config.refresh_rate = 1.0
        print(f"✓ Configuration modification successful")

        return True
    except Exception as e:
        print(f"✗ Configuration test failed: {e}")
        return False

async def test_dashboard_creation():
    """Test dashboard creation and basic functionality"""
    print("\nTesting dashboard creation...")

    try:
        from core.config import DashboardConfig
        from core.dashboard import ISHChatDashboard

        # Create configuration
        config = DashboardConfig()
        config.simulate_data = True
        config.debug = True
        config.refresh_rate = 1.0

        # Create dashboard instance
        dashboard = ISHChatDashboard(config)
        print("✓ Dashboard instance created successfully")

        # Test simulated data generation
        instances = dashboard._generate_simulated_instances()
        print(f"✓ Generated {len(instances)} simulated instances")

        if instances:
            print(f"  - First instance: {instances[0].instance_id}")
            print(f"  - Provider: {instances[0].provider_type}")
            print(f"  - Status: {instances[0].status}")

        # Test other simulation methods
        health_data = dashboard._generate_simulated_health_summary()
        print(f"✓ Generated health summary: {health_data.get('total_instances', 0)} instances")

        lb_data = dashboard._generate_simulated_lb_metrics()
        print(f"✓ Generated load balancer metrics: {lb_data.get('total_requests', 0)} requests")

        as_data = dashboard._generate_simulated_as_metrics()
        print(f"✓ Generated auto-scaling metrics: {as_data.get('active_groups', 0)} active groups")

        ext_data = dashboard._generate_simulated_external_agents()
        print(f"✓ Generated external agents: {ext_data.get('total', 0)} total agents")

        return True
    except Exception as e:
        print(f"✗ Dashboard creation test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_help_command():
    """Test help command functionality"""
    print("\nTesting help command...")

    try:
        import subprocess
        result = subprocess.run([
            sys.executable, 'main.py', '--help'
        ], capture_output=True, text=True, cwd=current_dir)

        if result.returncode == 0:
            print("✓ Help command works successfully")
            if '--simulate-data' in result.stdout:
                print("✓ --simulate-data flag available")
            if '--debug' in result.stdout:
                print("✓ --debug flag available")
            if '--refresh-rate' in result.stdout:
                print("✓ --refresh-rate flag available")
            return True
        else:
            print(f"✗ Help command failed with code {result.returncode}")
            print(f"  Error: {result.stderr}")
            return False
    except Exception as e:
        print(f"✗ Help command test failed: {e}")
        return False

async def main():
    """Run all tests"""
    print("ISH Chat CLI Dashboard - Quick Test")
    print("=" * 50)
    print(f"Python version: {sys.version}")
    print(f"Current directory: {current_dir}")
    print(f"Test started: {datetime.now().isoformat()}")
    print("=" * 50)

    tests = [
        ("Import Tests", test_imports),
        ("Dependency Tests", test_dependencies),
        ("Configuration Tests", test_configuration),
        ("Help Command Tests", test_help_command),
        ("Dashboard Creation Tests", test_dashboard_creation),
    ]

    results = []
    for test_name, test_func in tests:
        print(f"\n{'='*20} {test_name} {'='*20}")
        try:
            if asyncio.iscoroutinefunction(test_func):
                result = await test_func()
            else:
                result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"✗ {test_name} crashed: {e}")
            results.append((test_name, False))

    # Summary
    print("\n" + "=" * 50)
    print("TEST SUMMARY")
    print("=" * 50)

    passed = 0
    total = len(results)

    for test_name, result in results:
        status = "PASS" if result else "FAIL"
        symbol = "✓" if result else "✗"
        print(f"{symbol} {test_name}: {status}")
        if result:
            passed += 1

    print(f"\nOverall: {passed}/{total} tests passed")

    if passed == total:
        print("🎉 All tests passed! The CLI dashboard is ready to use.")
        print("\nQuick start commands:")
        print("  python3 main.py --simulate-data --debug")
        print("  python3 main.py --help")
        return 0
    else:
        print("❌ Some tests failed. Please check the errors above.")
        return 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)