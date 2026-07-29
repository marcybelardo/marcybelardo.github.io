# Portfolio redesign human test plan

Automated artifact coverage passed with 103 tests. Complete the following checks after deployment and record results in `docs/release-checks/portfolio-redesign.md`.

1. Inspect representative pages at 360px, 768px, and 1280px for overflow, clipping, empty controls, and broken links.
2. Use keyboard only to test header destinations, menu open/Escape/focus return, project and contact links, tag links, and footnotes.
3. Check wide margin-note placement, narrow linked endnotes, print preview, JavaScript-disabled behavior, and forced enhancement failure.
4. Verify portrait and landscape images remain fully visible inside square frames and use responsive sizing.
5. After deployment, verify GitHub Pages custom-domain and HTTPS settings, DNS records, TLS, and redirect chains with:

   - `curl -IL https://marcybelardo.github.io`
   - `curl -IL http://marcelinebelardo.com`
   - `curl -IL https://marcelinebelardo.com`
   - `curl -IL https://www.marcelinebelardo.com`

AC5.7 and the manual browser/release gates remain pending until these checks have durable evidence.
