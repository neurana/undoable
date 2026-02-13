---
name: web-search
description: Search the web and fetch page content for research, fact-checking, and information gathering.
metadata: {"undoable": {"emoji": "🔍"}}
---

# Web Search Skill

Use the `web_fetch` and `browse_page` tools to search the web and retrieve information.

## Quick Search

Use `web_fetch` to retrieve content from URLs:

```
web_fetch url:"https://example.com" extract:"text"
```

## Browse Pages

Use `browse_page` to navigate and interact with web pages:

```
browse_page url:"https://example.com" action:"screenshot"
```

## Best Practices

- Always verify information from multiple sources when possible
- Summarize long pages instead of returning raw content
- Respect rate limits and be mindful of the sites you access
- For search queries, use a search engine URL with the query parameter
