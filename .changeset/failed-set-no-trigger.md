---
'@zeus-js/signal': patch
---

Stop reactive and shallow reactive proxies from notifying effects when the
underlying `Reflect.set` fails, such as a write to a non-writable or getter-only
property or a new key on a non-extensible target.
