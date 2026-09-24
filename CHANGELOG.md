# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-09-25

### Added

- Side panel that reads the recipe on the current tab (schema.org JSON-LD, with a heading-based fallback).
- Voice and typed commands: next, back, repeat, start over, go to a step by number or description, ingredient amounts, ingredients for the current step, the full ingredient list.
- Timers that use the current step's cooking time, a time you say, or the right one of several times in a step. Timers chime and announce when done.
- Word-by-word recognition that acts on simple commands before you finish speaking.
- Spoken answers, also shown in the activity log, with "stop" working mid-sentence.
- On-device speech recognition on Chrome 139 and later.
- Current step highlighted and scrolled into view on the recipe page.
- API key check on save; clear messages for rejected keys, exhausted budgets and rate limits.

[1.0.0]: https://github.com/dgr8akki/recipe-mode/releases/tag/v1.0.0
