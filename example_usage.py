#!/usr/bin/env python3
"""
Example usage script for the /api/ocr/analyze endpoint
Demonstrates how to use the endpoint with both file uploads and Android screenshots
"""

import requests
import json
import os

# Configuration
BASE_URL = "http://localhost:8000"
API_KEY = None  # Add your API key if required

def test_file_upload(image_path):
    """Test OCR analysis with file upload"""
    print(f"Testing file upload with: {image_path}")

    if not os.path.exists(image_path):
        print(f"❌ Image file not found: {image_path}")
        return None

    url = f"{BASE_URL}/api/ocr/analyze"

    # Prepare the file and parameters
    with open(image_path, 'rb') as f:
        files = {'file': f}
        data = {
            'source': 'upload',
            'engine': 'tesseract',
            'language': 'eng',
            'preprocess': True,
            'analyze_layout': True,
            'extract_blocks': True,
            'save_result': True
        }

        headers = {}
        if API_KEY:
            headers['X-API-Key'] = API_KEY

        try:
            response = requests.post(url, files=files, data=data, headers=headers)
            response.raise_for_status()

            result = response.json()
            print("✅ File upload OCR analysis successful!")
            print(f"   Text extracted: {len(result.get('ocr_result', {}).get('text', ''))} characters")
            print(f"   Word count: {result.get('ocr_result', {}).get('word_count', 0)}")
            print(f"   Confidence: {result.get('ocr_result', {}).get('confidence', 0):.1f}%")
            print(f"   Execution time: {result.get('execution_time', 0)} seconds")

            if result.get('result_saved_to'):
                print(f"   Result saved to: {result['result_saved_to']}")

            return result

        except requests.exceptions.RequestException as e:
            print(f"❌ Request failed: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"   Response: {e.response.text}")
            return None

def test_android_screenshot():
    """Test OCR analysis with Android screenshot"""
    print("Testing Android screenshot OCR analysis")

    url = f"{BASE_URL}/api/ocr/analyze"

    data = {
        'source': 'android',
        'engine': 'easyocr',
        'language': 'eng',
        'preprocess': True,
        'analyze_layout': True,
        'extract_blocks': False,
        'save_result': False
    }

    headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    if API_KEY:
        headers['X-API-Key'] = API_KEY

    try:
        response = requests.post(url, data=data, headers=headers)
        response.raise_for_status()

        result = response.json()
        print("✅ Android screenshot OCR analysis successful!")
        print(f"   Screenshot path: {result.get('image_path')}")
        print(f"   Text extracted: {len(result.get('ocr_result', {}).get('text', ''))} characters")
        print(f"   Word count: {result.get('ocr_result', {}).get('word_count', 0)}")
        print(f"   Confidence: {result.get('ocr_result', {}).get('confidence', 0):.1f}%")
        print(f"   Execution time: {result.get('execution_time', 0)} seconds")

        return result

    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"   Response: {e.response.text}")
        return None

def test_get_engines():
    """Test getting available OCR engines"""
    print("Getting available OCR engines...")

    url = f"{BASE_URL}/api/ocr/engines"

    headers = {}
    if API_KEY:
        headers['X-API-Key'] = API_KEY

    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()

        result = response.json()
        print("✅ OCR engines retrieved successfully!")
        print(f"   Available engines: {list(result.get('available_engines', {}).keys())}")
        print(f"   Default engine: {result.get('default_engine')}")

        return result

    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"   Response: {e.response.text}")
        return None

def test_health_check():
    """Test API health check"""
    print("Performing health check...")

    url = f"{BASE_URL}/health"

    try:
        response = requests.get(url)
        response.raise_for_status()

        result = response.json()
        print("✅ Health check successful!")
        print(f"   Status: {result.get('status')}")
        print(f"   Version: {result.get('version')}")
        print(f"   Services: {result.get('services', {})}")

        return result

    except requests.exceptions.RequestException as e:
        print(f"❌ Health check failed: {e}")
        return None

def print_ocr_analysis_summary(result):
    """Print a detailed summary of OCR analysis result"""
    if not result:
        return

    print("\n" + "="*50)
    print("OCR ANALYSIS SUMMARY")
    print("="*50)

    print(f"Source: {result.get('source')}")
    print(f"Engine used: {result.get('ocr_result', {}).get('engine')}")
    print(f"Execution time: {result.get('execution_time', 0)} seconds")

    # Text information
    ocr_result = result.get('ocr_result', {})
    if 'text' in ocr_result:
        text = ocr_result['text']
        print(f"\nExtracted Text ({len(text)} characters):")
        print("-" * 30)
        print(text[:500] + ("..." if len(text) > 500 else ""))
        print("-" * 30)

    # Layout analysis
    analysis = result.get('analysis', {})
    if 'layout' in analysis:
        layout = analysis['layout']
        print(f"\nLayout Analysis:")
        print(f"   Lines: {layout.get('layout', {}).get('lines', 0)}")
        print(f"   Text region: {layout.get('layout', {}).get('text_region', {})}")

        if 'detailed_lines' in layout:
            print("   Line details:")
            for i, line in enumerate(layout['detailed_lines'][:5]):  # Show first 5 lines
                print(f"     Line {i+1}: {line.get('text', '')[:50]}...")

    # Text blocks
    if 'text_blocks' in analysis:
        blocks = analysis['text_blocks']
        print(f"\nText Blocks ({len(blocks)} blocks):")
        for i, block in enumerate(blocks[:3]):  # Show first 3 blocks
            print(f"   Block {i+1}: {block.get('text', '')[:100]}...")
            print(f"     Location: {block.get('bbox', {})}")

    print("="*50)

def main():
    """Main function to run all tests"""
    print("🔍 ISH Chat Integration - OCR Analyze Endpoint Test")
    print("=" * 60)

    # Check if server is running
    print("1. Checking if server is running...")
    health_result = test_health_check()
    if not health_result:
        print("❌ Server is not running or not accessible.")
        print("   Please start the server with: python3 src/main_refactored.py")
        return

    # Get available OCR engines
    print("\n2. Getting available OCR engines...")
    engines_result = test_get_engines()
    if not engines_result:
        print("❌ Failed to get OCR engines")
        return

    # Test file upload (if sample image exists)
    print("\n3. Testing file upload...")
    sample_images = [
        "/tmp/test_image.png",
        "sample_image.png",
        "test_image.jpg"
    ]

    file_test_done = False
    for image_path in sample_images:
        if os.path.exists(image_path):
            file_result = test_file_upload(image_path)
            if file_result:
                print_ocr_analysis_summary(file_result)
                file_test_done = True
            break

    if not file_test_done:
        print("⚠️  No sample image found for file upload test")
        print("   To test file upload, place an image file in one of these locations:")
        for path in sample_images:
            print(f"   - {path}")

    # Test Android screenshot
    print("\n4. Testing Android screenshot...")
    android_result = test_android_screenshot()
    if android_result:
        print_ocr_analysis_summary(android_result)
    else:
        print("⚠️  Android screenshot test failed")
        print("   Make sure an Android device is connected via ADB")

    print("\n🎉 OCR endpoint testing completed!")
    print("\n📝 Usage Summary:")
    print("   ✅ Server health check")
    print("   ✅ OCR engines retrieval")
    print("   ✅ File upload test" if file_test_done else "   ⚠️  File upload test (no sample image)")
    print("   ✅ Android screenshot test" if android_result else "   ⚠️  Android screenshot test")

    print("\n📚 API Documentation:")
    print("   Interactive docs: http://localhost:8000/docs")
    print("   OCR analyze: http://localhost:8000/api/ocr/analyze")
    print("   OCR engines: http://localhost:8000/api/ocr/engines")

if __name__ == "__main__":
    main()