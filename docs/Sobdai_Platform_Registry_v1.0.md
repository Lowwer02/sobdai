# Sobdai Platform Registry

Version: 1.0\
Status: Active

------------------------------------------------------------------------

## Purpose

The Platform Registry defines the architectural status of each major
subsystem in Sobdai.

Its purpose is to:

-   Prevent unnecessary refactoring
-   Define ownership boundaries
-   Help AI coding agents understand which platforms are frozen
-   Provide a single source of truth for platform lifecycle

------------------------------------------------------------------------

## Platform Status Definitions

  -----------------------------------------------------------------------
  Status                            Meaning
  --------------------------------- -------------------------------------
  🔒 Frozen                         Feature complete. Bug fixes only. No
                                    architectural refactoring without
                                    approval.

  ✅ Stable                         Production-ready. Minor enhancements
                                    allowed if they do not change
                                    responsibilities.

  🚧 Growing                        Active development. New features and
                                    architecture changes are expected.

  🧪 Experimental                   Prototype or research phase. APIs and
                                    responsibilities may change.
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## Current Registry

  --------------------------------------------------------------------------------------
  Platform              Status            Policy            Notes
  --------------------- ----------------- ----------------- ----------------------------
  Assessment Engine     🔒 Frozen         Bug Fix Only      Reader, Generator, Scoring,
  Core                                                      Ranking, Solver complete.

  Homepage v2           🔒 Frozen         Bug Fix / Copy    No new sections. Maintain
                                          Polish Only       Product Entry Point
                                                            philosophy.

  Support Platform      🔒 Frozen         Bug Fix Only      Single Source of Truth via
                                                            `extended_config.support`.

  Question Platform     ✅ Stable         Feature Complete  Question Bank, Metadata,
                                                            Usage, Inspector
                                                            operational.

  Homepage              ✅ Stable         Incremental       Homepage CMS and
  Configuration                           Enhancements      configuration system.
  Platform                                                  

  Promotion Platform    ✅ Stable         Incremental       Promotion management without
                                          Enhancements      architectural changes.

  Content Platform      🚧 Growing        Active            Summary Library, future
                                          Development       Article/News CMS.

  Government News CMS   🚧 Planned        New Development   Organic Search entry point.
                                                            Phase 1: Government Exam
                                                            News.

  Learning Intelligence 🚧 Planned        New Development   Recommendation, Continue
                                                            Learning, AI Tutor.

  Assessment Governance 🚧 Planned        New Development   Persistence, audit trail,
                                                            versioning, transactional
                                                            publishing.
  --------------------------------------------------------------------------------------

------------------------------------------------------------------------

## Architectural Rules

### Frozen Platforms

Frozen platforms must not receive:

-   New responsibilities
-   Architectural refactoring
-   Breaking API changes
-   Business logic redesign

Allowed:

-   Bug fixes
-   Security fixes
-   QA fixes
-   Performance improvements without changing responsibilities

------------------------------------------------------------------------

### Stable Platforms

Stable platforms may receive:

-   Small UX improvements
-   Internal optimizations
-   Non-breaking enhancements

They should preserve existing contracts.

------------------------------------------------------------------------

### Growing Platforms

Growing platforms are the primary focus for active product development.

Major architecture evolution is expected.

------------------------------------------------------------------------

## Engineering Policy

Before starting any Epic:

1.  Check this Platform Registry.
2.  Identify the target platform.
3.  Respect its lifecycle policy.
4.  If a Frozen platform must change, create an Architecture Decision
    before implementation.

------------------------------------------------------------------------

## Current Product Priority

1.  Content Production
2.  Summary Library
3.  Government News CMS
4.  Learning Intelligence
5.  Assessment Governance

------------------------------------------------------------------------

## Ownership Principle

Platforms own responsibilities.

Applications orchestrate platforms.

No platform should directly depend on another platform's internal
implementation.

------------------------------------------------------------------------

## Last Updated

Assessment Engine v1.0 Completion
