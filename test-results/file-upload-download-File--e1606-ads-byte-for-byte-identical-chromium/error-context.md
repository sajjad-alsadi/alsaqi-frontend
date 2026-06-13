# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: file-upload-download.spec.ts >> File upload/download round trip (Req 1.3) >> a 10 MB file is accepted and downloads byte-for-byte identical
- Location: apps\web\e2e\file-upload-download.spec.ts:128:3

# Error details

```
Error: page.evaluate: Error: XHR network error: POST http://localhost:3000/api/files
    at req.onerror (eval at evaluate (:302:30), <anonymous>:28:34)
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - link "Skip to content" [ref=e3] [cursor=pointer]:
    - /url: "#main-content"
  - generic [ref=e5]:
    - generic [ref=e7]:
      - button "اللغة" [ref=e9]:
        - img [ref=e10]
      - generic [ref=e14]:
        - img "App Logo" [ref=e17]
        - heading "بوابة التدقيق الداخلي" [level=1] [ref=e18]
        - paragraph [ref=e19]: مرحباً بك في نظام الساقي للتدقيق
      - generic [ref=e20]:
        - generic [ref=e21]:
          - generic [ref=e22]: اسم المستخدم أو البريد الإلكتروني
          - generic [ref=e23]:
            - img [ref=e24]
            - textbox "اسم المستخدم أو البريد الإلكتروني" [ref=e27]
        - generic [ref=e28]:
          - generic [ref=e29]: كلمة المرور
          - generic [ref=e30]:
            - img [ref=e31]
            - textbox "كلمة المرور" [ref=e34]:
              - /placeholder: ••••••••
            - button "⚠️ [auth.showPassword]" [ref=e35]:
              - img [ref=e36]
        - generic [ref=e39]:
          - generic [ref=e40] [cursor=pointer]:
            - checkbox "تذكرني" [ref=e41]
            - generic [ref=e42]: تذكرني
          - button "نسيت كلمة المرور أو تحتاج مساعدة؟" [ref=e43]
        - button "تسجيل دخول" [ref=e44]
      - paragraph [ref=e47]: جميع الحقوق محفوظة لشركة الساقي لخدمات الدفع الإلكتروني
    - generic [ref=e52]:
      - generic [ref=e53]:
        - generic [ref=e54]:
          - img [ref=e55]
          - generic [ref=e58]: وصول آمن
        - heading "دقة رقابية وثقة مؤسسية" [level=2] [ref=e59]
        - paragraph [ref=e60]: منصة متكاملة لإدارة أعمال التدقيق الداخلي والمتابعة والحوكمة بكفاءة ووضوح.
      - generic [ref=e61]:
        - generic [ref=e62]:
          - generic [ref=e63]: استقرار النظام
          - generic [ref=e64]: 99.98%
        - generic [ref=e65]:
          - generic [ref=e66]: مهام اليوم
          - generic [ref=e67]: 1,240+
```