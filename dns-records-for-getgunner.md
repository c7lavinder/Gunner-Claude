# DNS Records for getgunner.ai (Resend Email Verification)

Add these DNS records to your domain provider (where you manage getgunner.ai):

## Domain Verification (Required)

### DKIM Record
| Type | Name | Content |
|------|------|---------|
| TXT | resend._domainkey | p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDCDGdM8NDjgRqousb3cBMR+LNvXgOr/R7kFSth/Z4wYPzxF6WNE1y+qGgLkAQZBVenOwG19so6dmOpgjz5er5Vm5RA2GZYArJjulUrA0pLh+s5ml3cUKiJADxRzr+I3uWIs3g+xHBub6TzmVVN54jz3Zc8QuwnYzqGPBgMCwdcKQIDAQAB |

## Enable Sending (Required)

### SPF Records
| Type | Name | Content | Priority |
|------|------|---------|----------|
| MX | send | feedback-smtp.us-east-1.amazonses.com | 10 |
| TXT | send | v=spf1 include:amazonses.com ~all | - |

## DMARC (Optional but Recommended)
| Type | Name | Content |
|------|------|---------|
| TXT | _dmarc | v=DMARC1; p=none; |

---

After adding these records, go back to Resend and click "I've added the records" to verify.
DNS propagation can take up to 48 hours, but usually completes within a few minutes.
