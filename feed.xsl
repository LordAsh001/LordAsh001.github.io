<?xml version="1.0" encoding="UTF-8"?>
<!-- Makes /feed.xml readable when someone opens it in a browser. Feed readers ignore this file. -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:atom="http://www.w3.org/2005/Atom">
<xsl:output method="html" encoding="UTF-8" indent="yes" doctype-system="about:legacy-compat"/>
<xsl:template match="/">
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>Updates feed · <xsl:value-of select="/rss/channel/title"/></title>
<style>
:root{--paper:#EFEEE6;--card:#F6F5EE;--ink:#17201C;--muted:#5B635D;--rule:#CAC9B8;--accent:#1D6A5A;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--paper:#121815;--card:#18201C;--ink:#E6E5DA;--muted:#9BA29B;--rule:#2E3832;--accent:#7CC7AF;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.6 "Segoe UI",system-ui,-apple-system,sans-serif}
main{max-width:860px;margin:0 auto;padding:28px 16px 64px}
a{color:var(--accent)}
a:focus-visible,button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.back{font-size:15px;text-decoration:none}
h1{font:400 clamp(30px,5.5vw,42px)/1.1 Georgia,"Times New Roman",serif;letter-spacing:-.01em;margin:22px 0 10px}
.lead{color:var(--muted);max-width:64ch;margin:0}
.box{background:var(--card);border:1px solid var(--rule);border-radius:6px;padding:16px 20px;margin-top:22px}
.box h2{font-size:17px;margin:0 0 6px}
.box p,.box ol{margin:6px 0 0;color:var(--muted);font-size:15px}
.box ol{padding-left:20px}
.url{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
.url code{flex:1 1 240px;min-width:0;overflow-wrap:anywhere;font:14px ui-monospace,Menlo,Consolas,monospace;background:var(--paper);border:1px solid var(--rule);border-radius:6px;padding:8px 10px}
.url button,.cta{font:500 14px "Segoe UI",system-ui,sans-serif;border-radius:999px;padding:8px 16px;border:1px solid var(--ink);background:var(--ink);color:var(--paper);cursor:pointer;text-decoration:none;display:inline-block}
h2.list{font:12px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:400;margin:40px 0 0}
ul.items{list-style:none;margin:10px 0 0;padding:0}
ul.items li{padding:14px 0;border-bottom:1px dotted var(--rule)}
ul.items li:first-child{border-top:1px dotted var(--rule)}
ul.items time{display:block;font:12px ui-monospace,Menlo,Consolas,monospace;color:var(--accent)}
ul.items a{font-weight:500;text-decoration:none}
ul.items a:hover{text-decoration:underline}
ul.items p{margin:4px 0 0;color:var(--muted);font-size:15px}
</style>
</head>
<body>
<main>
<a class="back" href="/">← <xsl:value-of select="/rss/channel/title"/></a>
<h1>Updates feed</h1>
<p class="lead">New free tools, publications, talks and news, as an RSS feed. Add it to a feed reader to see new items as soon as they are posted.</p>

<div class="box">
<h2>How to follow</h2>
<ol>
<li>Copy the feed address below.</li>
<li>Paste it into a feed reader app, such as Feedly, Inoreader, NetNewsWire or Thunderbird.</li>
</ol>
<div class="url"><code id="feed-url">https://shagbaor.com/feed.xml</code><button type="button" id="copy">Copy address</button></div>
</div>

<div class="box">
<h2>Prefer email?</h2>
<p>Get the same updates by email instead, with a one-click unsubscribe link in every message.</p>
<p style="margin-top:12px"><a class="cta" href="/contact/#updates">Sign up for email updates</a></p>
</div>

<h2 class="list">Latest items</h2>
<ul class="items">
<xsl:for-each select="/rss/channel/item">
<li>
<xsl:if test="pubDate"><time><xsl:value-of select="substring(pubDate,6,11)"/></time></xsl:if>
<a href="{link}"><xsl:value-of select="description"/></a>
</li>
</xsl:for-each>
</ul>
</main>
<script>
document.getElementById('copy').addEventListener('click',function(){
  var b=this,t=document.getElementById('feed-url').textContent;
  function done(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy address';},2000);}
  if(navigator.clipboard){navigator.clipboard.writeText(t).then(done,function(){});}
});
</script>
</body>
</html>
</xsl:template>
</xsl:stylesheet>
