# Submitting a game

Sources: the BeyondPlay creator MCP (`https://app.beyondplay.xyz/api/mcp`),
its `get_contract` tool, the creator terms, and the review gate at
`app.beyondplay.xyz/admin/reviews`.

Nothing is published from your machine and no secrets are involved. The
creator MCP signs your agent in as you (OAuth, a browser window on
BeyondPlay's login), takes the source archive, builds and checks it on the
platform, publishes it unlisted under your account and submits it for
review. Approval is what lists the game.

## The ladder

```
npm run ladder                           LADDER-OK locally (see smoke-ladder.md)
  -> icon rendered, CREDITS.md complete  required; publish refuses a game with no icon
  -> npm run pack                        out/<slug>.tar.gz
  -> create_project                      one project per game
  -> request_upload_url + PUT            the archive
  -> start_build, get_build              the hosted build and checks pass
  -> set_metadata, set_icon              listing text and the icon
  -> publish_unlisted                    playable by link, absent from the feed and store
  -> get_project                         until publish.state is "published"
  -> a human plays it live               on a phone, by the link
  -> submit_for_review                   one more hosted build over the live archive, then the queue
  -> a reviewer approves                 once the check passed; approval lists the game
  -> the feed picks it up                on the platform's next rankings run
```

## Connecting

Your BeyondPlay account needs creator access (join the creator waitlist in
the app) and, during the beta, a place on the allowlist (ask the team).

Claude Code:

```bash
claude mcp add --transport http beyondplay https://app.beyondplay.xyz/api/mcp
```

Then `/mcp`, pick **beyondplay** and sign in. The plugin in this repository
(`/plugin marketplace add Beyond-Network-AI/beyondplay-skills`) registers the
same server. Other clients (Claude.ai, ChatGPT, Cursor) take the same address
as a custom connector or MCP server. Start with `whoami`: it names the account
the agent is acting as. If it is not yours, disconnect and sign in again.

## Before uploading

1. `npm run ladder -- games/<slug>` prints `LADDER-OK` on the current source.
2. `assets/icon.png` exists (512 x 512). The banner (1920 x 1080) is optional.
3. `publish.config.json` complete: `slug`, `name`, `tagline`, `description`
   (with the fan disclaimer where required), up to four `tags`, `ageRating`,
   `visibility: "unlisted"`.
4. `CREDITS.md` names every asset and track with author, source and licence.
   You attest to that list when you submit, under the creator terms.
5. Screenshots inspected by a person.
6. `npm run pack -- games/<slug>` wrote `out/<slug>.tar.gz` (source only:
   `src/`, `public/`, `smoke.driver.mjs`, `CREDITS.md`,
   `publish.config.json`; never `node_modules` or `dist`).

## The tools, in order

1. `get_contract` once per session: the current limits, the issue codes and
   the terms version. Without this kit checked out, `get_template` returns
   the starter game's files inline, with the platform-owned ones flagged;
   the kit's checks still need the kit.
2. `create_project` with `name` and an `idempotencyKey` (any stable string;
   a retry returns the same project). Keep the `projectId`.
3. `request_upload_url` for the project, then PUT `out/<slug>.tar.gz` to the
   returned URL with the returned headers, within five minutes:

   ```bash
   curl -X PUT -H "content-type: application/gzip" --data-binary @out/<slug>.tar.gz "<url>"
   ```

4. `start_build` with the `uploadId`, then `get_build` every 15 to 20 seconds
   until `state` is `passed` or `failed` (allow up to ten minutes; the first
   build wakes a sandbox). A failed report lists issues with codes, paths and
   fixes: fix the source, run the ladder, pack and upload again. The hosted
   check runs the build, the manifest, the bundle limits and conformance; it
   does not yet run the browser checks.
5. `set_metadata` with `tagline`, `description` and `tags` from
   `publish.config.json`.
6. `request_icon_upload_url` with kind `icon`, PUT `assets/icon.png`, then
   `set_icon` with the `uploadId`. Repeat with kind `banner` for
   `assets/banner.jpg` if you have one.
7. `publish_unlisted` with the slug. Then `get_project` every 20 seconds
   until `publish.state` is `published` (allow up to six minutes). The game
   is playable at `https://<slug>.beyondplay.xyz` and
   `https://app.beyondplay.xyz/game/<slug>`; the leaderboard works at once;
   the feed and the duel picker do not show it yet.
8. Play it on a phone. Fix, rebuild, re-upload and republish as needed; the
   slug stays yours.
9. `submit_for_review`. The platform runs one more hosted build over the
   archive that is live (the submission check); `get_review_status` shows
   its state and issues, and a reviewer can approve once it passes. If you
   built again after publishing, submit refuses with `REPUBLISH_REQUIRED`:
   publish first, so the game under review is the game that is live.
   `get_review_status` and a notification carry the result: approved
   (listed), changes requested (with notes; fix, republish and submit
   again) or rejected (with notes). `withdraw_submission` pulls a pending
   submission.

Limits: 50 MB and 1,500 files per archive, 10 MB per file; one build at a
time, 50 a day, 10 in five minutes; 60 requests a minute. Slugs match
`^[a-z0-9][a-z0-9-]{2,40}$` and are first come, first served.

## Republishing and changes

- Republish by uploading a new archive, building and calling
  `publish_unlisted` again with the same slug; the live files update. An
  approved game stays listed on republish; a game under review is re-checked.
- Renaming a slug is a new publish; ask the team to hide the old one.
- Fixed filenames under `public/` can serve stale from the edge cache for up
  to seven days; content-hashed imports from `src/` do not.

## The review ladder and what reviewers reject

The gate is the hosted checks plus a human look, in two stages: stage one on
metadata and assets, stage two in-game on a phone. Every update is re-checked.

Automatable rejections: a failing check; a fallback manifest; bundle size or
file count over budget; dev artefacts or forbidden assets in the build; wrong
manifest or SDK use; external requests; profanity in title, description or
tags; a missing icon; a secret in the bundle.

Human rejections seen so far:

- Instruction text, a splash or tap-to-start gate, or an idle card that dies
  before 12 s.
- Art that does not match the game, or does not hold together as one style.
- Third-party brands, characters or IP without an agreement; a missing fan
  disclaimer.
- Thumbnails not true to gameplay; real photographs of people.
- A character that does not look like the licensed character; a run clip
  played so fast that the running style looks wrong.
- Cluttered HUD text; a character picker where nobody chooses.
- Game over reported on the crash frame in a swipe game, so the reflex swipe
  pages the feed and the player loses the game.
- Earnings or purchase language inside the game.
- Audio or art with no source and licence in `CREDITS.md`, or under a licence
  that excludes games or monetised use.

## If something fails

- Sign-in says "private beta": your account is not on the list yet.
- Sign-in says "no creator access": join the creator waitlist in the app.
- A scope error names the scope: disconnect and connect again to re-authorize.
- `start_build` returns `SANDBOX_IMAGE_UNAVAILABLE`: the platform is waking its
  build image; try again in a few minutes.
- `publish_unlisted` returns `ICON_REQUIRED` or `METADATA_REQUIRED`: steps 5
  and 6 above.
- A slug is taken: pick another; slugs are not transferable.
