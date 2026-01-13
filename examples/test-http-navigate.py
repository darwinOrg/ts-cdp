#!/usr/bin/env python3
"""
HTTP API 导航接口测试示例
测试 /api/page/navigate 接口
"""

import requests
import time
import json

BASE_URL = "http://localhost:3000"
SESSION_ID = f"test-navigate-{int(time.time())}"


def print_step(step_num, description):
    """打印测试步骤"""
    print(f"\n{'='*60}")
    print(f"📌 步骤 {step_num}: {description}")
    print(f"{'='*60}\n")


def print_response(title, response):
    """打印响应结果"""
    print(f"✅ {title}")
    print(f"状态码: {response.status_code}")
    try:
        data = response.json()
        print(f"响应数据: {json.dumps(data, indent=2, ensure_ascii=False)}")
        return data
    except:
        print(f"响应内容: {response.text}")
        return None


def test_navigate_api():
    """测试导航 API"""
    
    print("╔══════════════════════════════════════════════════════════╗")
    print("║              HTTP API 导航测试示例 (Python)               ║")
    print("╚══════════════════════════════════════════════════════════╝")

    try:
        # ========== 步骤 1: 启动浏览器 ==========
        print_step(1, "启动浏览器")
        print(f"POST {BASE_URL}/api/browser/start")
        
        start_response = requests.post(
            f"{BASE_URL}/api/browser/start",
            json={
                "sessionId": SESSION_ID,
                "headless": True
            }
        )
        print_response("浏览器启动成功", start_response)
        
        time.sleep(2)

        # ========== 步骤 2: 导航到百度 ==========
        print_step(2, "导航到百度")
        print(f"POST {BASE_URL}/api/page/navigate")
        
        navigate_response1 = requests.post(
            f"{BASE_URL}/api/page/navigate",
            json={
                "sessionId": SESSION_ID,
                "url": "https://www.baidu.com"
            }
        )
        print_response("导航到百度成功", navigate_response1)
        
        time.sleep(3)

        # ========== 步骤 3: 获取页面标题 ==========
        print_step(3, "获取页面标题")
        print(f"GET {BASE_URL}/api/page/title?sessionId={SESSION_ID}")
        
        title_response1 = requests.get(
            f"{BASE_URL}/api/page/title",
            params={"sessionId": SESSION_ID}
        )
        title_data1 = print_response("页面标题", title_response1)
        if title_data1:
            print(f"📄 标题内容: {title_data1.get('title', 'N/A')}")

        # ========== 步骤 4: 导航到 GitHub ==========
        print_step(4, "导航到 GitHub")
        print(f"POST {BASE_URL}/api/page/navigate")
        
        navigate_response2 = requests.post(
            f"{BASE_URL}/api/page/navigate",
            json={
                "sessionId": SESSION_ID,
                "url": "https://github.com"
            }
        )
        print_response("导航到 GitHub 成功", navigate_response2)
        
        time.sleep(3)

        # ========== 步骤 5: 获取页面 URL ==========
        print_step(5, "获取页面 URL")
        print(f"GET {BASE_URL}/api/page/url?sessionId={SESSION_ID}")
        
        url_response = requests.get(
            f"{BASE_URL}/api/page/url",
            params={"sessionId": SESSION_ID}
        )
        url_data = print_response("当前页面 URL", url_response)
        if url_data:
            print(f"🔗 URL: {url_data.get('url', 'N/A')}")

        # ========== 步骤 6: 获取页面标题 ==========
        print_step(6, "获取页面标题")
        print(f"GET {BASE_URL}/api/page/title?sessionId={SESSION_ID}")
        
        title_response2 = requests.get(
            f"{BASE_URL}/api/page/title",
            params={"sessionId": SESSION_ID}
        )
        title_data2 = print_response("页面标题", title_response2)
        if title_data2:
            print(f"📄 标题内容: {title_data2.get('title', 'N/A')}")

        # ========== 步骤 7: 截图 ==========
        print_step(7, "截图")
        print(f"POST {BASE_URL}/api/page/screenshot")
        
        screenshot_response = requests.post(
            f"{BASE_URL}/api/page/screenshot",
            json={
                "sessionId": SESSION_ID,
                "format": "png"
            }
        )
        print(f"✅ 截图成功")
        print(f"状态码: {screenshot_response.status_code}")
        print(f"图片大小: {len(screenshot_response.content)} 字节")
        
        # 保存截图
        screenshot_path = f"screenshot_{SESSION_ID}.png"
        with open(screenshot_path, 'wb') as f:
            f.write(screenshot_response.content)
        print(f"💾 截图已保存到: {screenshot_path}")

        # ========== 步骤 8: 获取页面 HTML ==========
        print_step(8, "获取页面 HTML")
        print(f"GET {BASE_URL}/api/page/html?sessionId={SESSION_ID}")
        
        html_response = requests.get(
            f"{BASE_URL}/api/page/html",
            params={"sessionId": SESSION_ID}
        )
        html_data = print_response("页面 HTML", html_response)
        if html_data:
            html_content = html_data.get('html', '')
            print(f"📄 HTML 大小: {len(html_content)} 字符")
            print(f"📄 HTML 前200字符: {html_content[:200]}...")

        # ========== 步骤 9: 执行 JavaScript ==========
        print_step(9, "执行 JavaScript")
        print(f"POST {BASE_URL}/api/page/execute")
        
        script_response = requests.post(
            f"{BASE_URL}/api/page/execute",
            json={
                "sessionId": SESSION_ID,
                "script": "document.location.href"
            }
        )
        script_data = print_response("执行结果", script_response)
        if script_data:
            print(f"🔧 结果: {script_data.get('result', 'N/A')}")

        # ========== 步骤 10: 停止浏览器 ==========
        print_step(10, "停止浏览器")
        print(f"POST {BASE_URL}/api/browser/stop")
        
        stop_response = requests.post(
            f"{BASE_URL}/api/browser/stop",
            json={"sessionId": SESSION_ID}
        )
        print_response("浏览器已停止", stop_response)

        print("\n╔══════════════════════════════════════════════════════════╗")
        print("║                  测试完成 ✅                            ║")
        print("╚══════════════════════════════════════════════════════════╝\n")

    except requests.exceptions.ConnectionError:
        print("\n❌ 错误: 无法连接到服务器")
        print("请确保 HTTP 服务器正在运行: npm run server")
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        
        # 尝试清理
        try:
            requests.post(
                f"{BASE_URL}/api/browser/stop",
                json={"sessionId": SESSION_ID}
            )
        except:
            pass


if __name__ == "__main__":
    test_navigate_api()