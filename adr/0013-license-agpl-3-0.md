# License: GNU AGPL-3.0

## Status

Accepted

## Context

This is a *web* template — most projects built from it will run as a hosted
service rather than be distributed as a binary. A permissive or plain-GPL
license would let someone build a proprietary SaaS on top of it without ever
sharing source, since GPL's copyleft triggers on distribution, and running a
modified version as a network service isn't "distribution."

## Decision

License the template under GNU AGPL-3.0. AGPL closes the network-service
gap: anyone who lets users interact with a modified version over a network
must also make that version's source available.

## Consequences

Anyone can use and modify this template, but anything built with it must
stay open source, including when it's only ever run as a service and never
"distributed" in the traditional sense. A meaningfully more restrictive
choice than the MIT/permissive licenses commonly used for templates —
deliberate, not an oversight.
