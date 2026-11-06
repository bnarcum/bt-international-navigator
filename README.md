# BT International Navigator

Unofficial explorer for how [BT International](https://international.bt.com/) products relate to each other, and where Cisco sits on that map.

**Live:** https://bnarcum.github.io/bt-international-navigator/

Public catalog snapshot from [international.bt.com](https://international.bt.com/) and [cisco.com](https://www.cisco.com/) — not affiliated with BT Group or Cisco.

## How it works

1. **Home** — Secure Connectivity, Voice & Collaboration, or Managed Services
2. **Topic** — one page: what it is, why it connects, the public BT page, and the Cisco family when there is one
3. **See how it connects** — the map, plus a Cisco lens

Search from the top: Global Fabric, SASE, Webex.

## Run locally

```bash
python3 -m http.server 8765
```

Open http://localhost:8765/

```bash
npm test
```
