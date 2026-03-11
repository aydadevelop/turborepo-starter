# Discovery Roles And Mental Models

**Status:** Working document  
**Date:** 2026-03-11  
**Related:** [product-discovery-playbook](../product-discovery-playbook.md), [real-user-test-matrix](../real-user-test-matrix.md)

## Purpose

This folder contains reusable role files for product discovery and Playwright exploration.

These are not implementation specs.

They describe:

- how different actors think
- what they are trying to accomplish
- what they need to trust
- where they feel risk or friction
- what we should inspect when exploring our product or a competitor

## How To Use These Files

For each discovery session:

1. pick one `role`
2. pick one `service family`
3. pick one `mission`
4. explore the target system in Playwright from that role’s point of view
5. record:
   - trust triggers
   - confusion points
   - missing concepts
   - places where the system leaks internal implementation instead of supporting the role’s mental model

## Initial Role Set

Demand-side:

- [traveler-excursions.md](./traveler-excursions.md)
- [traveler-boat-rent.md](./traveler-boat-rent.md)

Supply-side:

- [excursion-provider.md](./excursion-provider.md)
- [boat-rent-operator.md](./boat-rent-operator.md)

Business and platform:

- [organization-owner.md](./organization-owner.md)
- [platform-operations-and-moderation.md](./platform-operations-and-moderation.md)
- [customer-support-agent.md](./customer-support-agent.md)

## Core Rule

We should design around the actor’s mental model, not around our database tables or package boundaries.

Examples:

- travelers think in `where`, `when`, `with whom`, `what will happen`, `can I trust this`
- providers think in `can I publish`, `can I manage dates/prices`, `what do I need to confirm`, `why is this unavailable`
- org owners think in `what businesses can I run here`, `is the org ready`, `who can manage what`
- operations think in `what is risky`, `what is broken`, `what needs intervention`

## Session Output Template

Each session should end with:

1. `Role`
2. `Service family`
3. `Mission`
4. `What worked`
5. `What confused the user`
6. `What trust signals existed or were missing`
7. `What objects/states the UI should expose more clearly`
8. `Feature candidates`
9. `First red test`
