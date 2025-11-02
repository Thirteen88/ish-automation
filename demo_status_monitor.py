#!/usr/bin/env python3
"""
Demonstration script showing the fixed status monitor working with realistic data
"""
import sys
import os
import asyncio
import json
import logging
from datetime import datetime, timedelta

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from services.status_monitor import StatusMonitor
from services.external_agent_delegator import ExternalAgentDelegator

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def demo_status_monitor():
    """Demonstrate the status monitor working with realistic scenarios"""
    print("=" * 70)
    print("AI Status Monitoring System - Fixed String Attribute Error Demo")
    print("=" * 70)
    
    monitor = StatusMonitor()
    delegator = ExternalAgentDelegator()
    
    print("\n1. Initializing models...")
    print(f"   Total models initialized: {len(monitor.models)}")
    for model_key, model in monitor.models.items():
        print(f"   - {model.name}: {model.status} ({model.connection_status})")
    
    print("\n2. Simulating API responses with various data quality issues...")
    
    # Import the DelegationResult class
    from services.external_agent_delegator import DelegationResult
    
    # Simulate some external agent tasks as proper DelegationResult objects
    delegator.completed_tasks = [
        DelegationResult(
            task_id="demo_task_1",
            agent_used="claude_opus_4_1_thinking",
            success=True,
            execution_time_seconds=25.5,
            result={"analysis": "Code review completed successfully"},
            quality_score=0.92,
            completed_at=(datetime.utcnow() - timedelta(minutes=30)).isoformat()
        ),
        DelegationResult(
            task_id="demo_task_2", 
            agent_used="gpt_5",
            success=True,
            execution_time_seconds=18.2,
            result={"recommendations": ["Optimize database queries", "Add error handling"]},
            quality_score=0.87,
            completed_at=(datetime.utcnow() - timedelta(minutes=15)).isoformat()
        ),
        DelegationResult(
            task_id="demo_task_3",
            agent_used="zai",
            success=False,
            execution_time_seconds=12.1,
            error="API timeout",
            completed_at=(datetime.utcnow() - timedelta(minutes=5)).isoformat()
        )
    ]
    
    print("\n3. Testing external agent delegation status...")
    try:
        agents = delegator.get_available_agents()
        print(f"   ✓ Successfully retrieved {len(agents)} available agents")
        
        # Show some agent performance stats
        for agent_name, agent_data in list(agents.items())[:3]:  # Show first 3
            perf = agent_data.get("performance", {})
            print(f"   - {agent_data['name']}:")
            print(f"     Total completed: {perf.get('total_completed', 0)}")
            print(f"     Recent completed: {perf.get('recent_completed', 0)}")
            print(f"     Success rate: {perf.get('success_rate', 0):.1%}")
            print(f"     Status: {agent_data.get('status', 'unknown')}")
            
    except Exception as e:
        print(f"   ✗ Error getting agent status: {e}")
        return False
    
    print("\n4. Testing status display generation...")
    try:
        # Mock the API calls for demo purposes
        import unittest.mock
        with unittest.mock.patch('requests.get') as mock_get:
            # Mock successful responses
            mock_response = unittest.mock.Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "status": "healthy",
                "agents": [
                    {"name": "Claude Opus 4.1 Thinking", "available": True},
                    {"name": "GPT-5", "available": True},
                    {"name": "ZAI", "available": False}
                ],
                "history": [
                    {
                        "session_id": "active_task_1",
                        "status": "in_progress",
                        "created_at": (datetime.utcnow() - timedelta(minutes=10)).isoformat()
                    }
                ],
                "metrics": {
                    "total_delegations": 15,
                    "success_rate": 0.87
                }
            }
            mock_get.return_value = mock_response
            
            # Generate status display
            status = await monitor.generate_status_display()
            
            print("   ✓ Status display generated successfully!")
            print(f"   - ISH Chat healthy: {status['session_info']['ish_chat_healthy']}")
            print(f"   - External agents available: {status['session_info']['external_agents_available']}")
            print(f"   - Android connected: {status['session_info']['android_connected']}")
            print(f"   - Total models: {status['models']['total']}")
            print(f"   - Active models: {status['models']['active']}")
            print(f"   - Idle models: {status['models']['idle']}")
            print(f"   - Total active tasks: {status['tasks']['total']}")
            print(f"   - Tasks in progress: {status['tasks']['in_progress']}")
            
    except Exception as e:
        print(f"   ✗ Error generating status display: {e}")
        return False
    
    print("\n5. Testing error handling with malformed data...")
    try:
        import unittest.mock
        with unittest.mock.patch('requests.get') as mock_get:
            # Mock various error scenarios
            scenarios = [
                ("String instead of dict", "this should be json but it's not"),
                ("Dict with string agents", {"agents": "should be a list"}),
                ("List with mixed types", {"agents": [{"name": "valid", "available": True}, "invalid_string"]}),
                ("Invalid JSON", None)  # This will trigger JSONDecodeError
            ]
            
            for scenario_name, mock_data in scenarios:
                mock_response = unittest.mock.Mock()
                mock_response.status_code = 200
                
                if mock_data is None:
                    mock_response.json.side_effect = json.JSONDecodeError("Invalid JSON", "", 0)
                else:
                    mock_response.json.return_value = mock_data
                    
                mock_get.return_value = mock_response
                
                try:
                    result = await monitor.check_external_agent_status()
                    print(f"   ✓ {scenario_name}: Handled gracefully (result: {result})")
                except Exception as e:
                    print(f"   ✗ {scenario_name}: Error not handled: {e}")
                    return False
                    
    except Exception as e:
        print(f"   ✗ Error in error handling test: {e}")
        return False
    
    print("\n6. Writing status to file...")
    try:
        success = await monitor.write_status_file()
        if success:
            print("   ✓ Status file written successfully")
            # Check if file exists and show size
            if monitor.status_file.exists():
                file_size = monitor.status_file.stat().st_size
                print(f"   - File location: {monitor.status_file}")
                print(f"   - File size: {file_size} bytes")
                
                # Show a preview of the status file content
                with open(monitor.status_file, 'r') as f:
                    content = json.load(f)
                print(f"   - Timestamp: {content['timestamp']}")
                print(f"   - Models tracked: {len(content['models']['details'])}")
                print(f"   - Active tasks: {len(content['tasks']['active'])}")
        else:
            print("   ✗ Failed to write status file")
            return False
            
    except Exception as e:
        print(f"   ✗ Error writing status file: {e}")
        return False
    
    return True

async def main():
    """Main demonstration function"""
    try:
        success = await demo_status_monitor()
        
        print("\n" + "=" * 70)
        if success:
            print("🎉 DEMO SUCCESSFUL!")
            print("✅ All string attribute error fixes are working correctly")
            print("✅ Status monitoring handles malformed API responses gracefully")
            print("✅ External agent delegation system works without errors")
            print("✅ Error handling prevents crashes from bad data")
            print("\nThe AI status monitoring system is now robust and reliable!")
        else:
            print("❌ DEMO FAILED!")
            print("Some issues were detected. Please check the error messages above.")
        
        print("=" * 70)
        return 0 if success else 1
        
    except KeyboardInterrupt:
        print("\n\nDemo interrupted by user.")
        return 130
    except Exception as e:
        print(f"\n\nDemo failed with unexpected error: {e}")
        return 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)