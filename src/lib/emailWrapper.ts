/**
 * Email wrapper template for COhere emails
 * This wrapper provides consistent branding across all email communications
 */

export const getEmailWrapper = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif;
      background-color: #faf9f7;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background: linear-gradient(135deg, hsl(28, 45%, 25%), hsl(175, 65%, 35%));
      padding: 40px 20px;
      text-align: center;
    }
    .header h1 {
      color: #ffffff;
      font-size: 36px;
      margin: 0;
      font-weight: 700;
    }
    .header .bracket {
      color: #ffffff;
    }
    .header .here {
      color: hsl(42, 85%, 75%);
    }
    .content {
      padding: 40px 30px;
      color: hsl(28, 25%, 15%);
      line-height: 1.6;
    }
    .content h2 {
      color: hsl(175, 65%, 35%);
      margin-top: 0;
    }
    .content a {
      color: hsl(175, 65%, 35%);
      text-decoration: underline;
    }
    .button {
      display: inline-block;
      padding: 12px 32px;
      background: hsl(175, 65%, 35%);
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 12px;
      font-weight: 600;
      margin: 20px 0;
    }
    .footer {
      background-color: hsl(42, 45%, 92%);
      padding: 30px;
      text-align: center;
      color: hsl(28, 15%, 45%);
      font-size: 14px;
    }
    .footer p {
      margin: 5px 0;
    }
    .divider {
      height: 4px;
      background: linear-gradient(90deg, hsl(175, 65%, 35%), hsl(42, 85%, 75%), hsl(22, 88%, 65%));
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1><span class="bracket">[CO]</span><span class="here">here</span></h1>
    </div>
    <div class="divider"></div>
    <div class="content">
      ${content}
    </div>
    <div class="divider"></div>
    <div class="footer">
      <p><strong>COhere</strong> - Weaving Our Resilience</p>
      <p>Boulder, Colorado</p>
      <p style="margin-top: 15px;">
        <a href="https://cohereboulder.org" style="color: hsl(175, 65%, 35%); text-decoration: none;">cohereboulder.org</a>
      </p>
    </div>
  </div>
</body>
</html>
`;
