# Private Google Analytics reports

The three pages use GA4 Measurement ID `G-5B6JH0FLJR`. This public identifier
enables collection; it does not grant access to reports. Keep access limited to
your own Google account in **Analytics Admin → Account access management** and
**Property access management**, including inherited permissions.

## Visitor choices

The site uses basic consent mode. A visitor sees a small **Optional analytics**
notice and can choose **Accept analytics** or **Decline**. No Google analytics
script or request is sent before acceptance. The site records the preference in
`krejuv-fec-analytics-consent-v1` in localStorage; reference records are not stored
there. A returning visitor can change the choice using **Analytics settings** in
the footer. Withdrawing acceptance disables analytics, clears this site's GA
cookies, and reloads the page to remove the loaded tag. Browser Global Privacy
Control and Do Not Track requests keep analytics off.

Advertising storage, ad-user-data consent, ad personalization, Google signals,
and ad-personalization signals are disabled. The configured tag records page
views with sanitized page and referrer URLs (no query string or fragment). The
code does not send names, emails, raw IP parameters, permit records, or custom
personal device names. Google Analytics can derive approximate location and
browser/device statistics; it does not provide raw visitor IPs in its reports.

GA cookies use the `krejuv_fec` prefix and `/HAFIZ-KREJUV/` path. The CSP permits
the Google tag and GA collection hosts while keeping Apps Script data access as
before. No API key, client secret, OAuth login, or Apps Script change is required
for this GA4 integration.

## Check collection as the owner

1. Open the live site and choose **Accept analytics**. If you previously declined,
   open **Analytics settings** at the bottom to change the preference.
2. Sign in to https://analytics.google.com/ using the property-owning account.
3. Select the property containing `G-5B6JH0FLJR` and open **Reports → Realtime**.
4. Visit Overview, Swabbing/Dew Point, and Summary. Verify the page views arrive.
   Initial processing can take time; blockers or browser privacy settings can
   prevent collection. Standard reports may take longer than Realtime.
5. Use **Demographic details** for approximate country/city, **Pages and screens**
   for visited pages, and **Tech details** for browser/device information.

Reports stay in your Analytics account. No report data, visitor locations, IPs,
or device details are rendered in the public footer. The separate public visit
counter is an Apps Script feature and remains in its own draft until deployed;
its approximate session count is not the same metric as GA4 users.

Analytics starts after installation and visitor acceptance. It cannot reconstruct
historical visits or identify anonymous visitors by real name.
