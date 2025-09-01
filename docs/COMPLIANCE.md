# Compliance & Legal Notes

## robots.txt Compliance

This crawler respects STARK's robots.txt guidelines:

1. **User-Agent Identification**: Clear identification as "StarkCrawler/1.0"
2. **Rate Limiting**: Maximum 2 requests per second
3. **Crawl Delay**: Configurable delay between requests (default 1000ms)
4. **Sitemap Usage**: Only uses publicly available sitemaps
5. **No Disallowed Paths**: Avoids any paths marked as Disallow in robots.txt

## Data Collection Principles

- **Public Data Only**: Only collects publicly visible product information
- **No Personal Data**: Does not collect user data or personal information
- **No Authentication Bypass**: Does not attempt to access restricted areas
- **Respectful Crawling**: Implements exponential backoff on errors

## Legal Considerations

### Terms of Service
- Review STARK's Terms of Service before deployment
- This crawler is for legitimate business purposes only
- Ensure compliance with local data protection laws

### GDPR Compliance
- No personal data is collected or stored
- Product data only (SKU, EAN, prices, stock status)
- Implements data retention policies (configurable)

### Recommended Usage
1. **Business Partnership**: Consider reaching out to STARK for official access
2. **API Migration**: Ready to switch to official API when available
3. **Rate Limits**: Always respect server resources
4. **Contact Info**: Provide valid contact in User-Agent string

## Best Practices

### DO:
- ✅ Monitor crawl logs for errors
- ✅ Implement circuit breakers for repeated failures
- ✅ Cache results to minimize requests
- ✅ Respect server response codes (429, 503)
- ✅ Use official APIs when available

### DON'T:
- ❌ Overwhelm servers with concurrent requests
- ❌ Ignore robots.txt directives
- ❌ Scrape user-generated content
- ❌ Bypass authentication mechanisms
- ❌ Use data for unauthorized purposes

## Contact & Disputes

If STARK contacts you regarding the crawler:
1. Immediately pause crawling operations
2. Respond promptly and professionally
3. Offer to discuss official data access
4. Comply with any reasonable requests

## Updates & Monitoring

- Regularly check robots.txt for changes
- Monitor STARK's developer documentation
- Subscribe to any available developer newsletters
- Keep crawler code updated with best practices

## Disclaimer

This crawler is provided for educational and legitimate business purposes only. Users are responsible for ensuring their use complies with all applicable laws and terms of service.