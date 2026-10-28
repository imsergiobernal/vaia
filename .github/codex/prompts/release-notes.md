# Consolidate release notes in your personal Codex session

The maintainer is `imsergiobernal` (GitHub user ID `20087388`). Start this task
from your personal Codex account with the connected Vaia repository. Repository
prompts and provenance metadata are not an authentication mechanism.

After preparing the changelog locally, open a same-repository PR from
`release/<component>-vX.Y.Z` or `hotfix/<component>-vX.Y.Z` to `main`:

1. Capture the release branch head as the stabilization candidate, its component
   and version. Confirm complete history and tags. Select the nearest reachable
   stable tag for that component; use the empty tree for a first release.
2. Compare that baseline with the candidate. Read the net diff and relevant
   source, tests and documentation. Describe final user-visible changes, omit
   internal tooling and intermediate iterations, and verify incompatible changes.
3. Edit only the target version entry in the component `CHANGELOG.md` on the
   release branch. Preserve its heading, date, comparison link and older entries.
   Do not change manifests or dependencies or create another branch or PR.
4. Add exactly one freshness marker within the entry, using actual values and
   JSON `null` for a first release:

   <!-- vaia-release-notes {"component":"cli","version":"0.2.0","candidate":"<40-character-candidate-sha>","previous_tag":"cli-v0.1.0"} -->

5. Verify the branch head has not moved, commit the notes on the release branch
   with a Conventional Commit such as `docs(release): summarize cli 0.2.0 changes`,
   and push if authorized. If source changes after the captured candidate, draft
   again. The synchronizer verifies the candidate is an ancestor and the only
   net change since it is the component changelog.
6. Report the source evidence and uncertainties. Do not invent release content,
   update the PR body directly, merge, create tags, publish or send public comments.

After the notes commit is pushed, **Prepare release branch** checks freshness and
copies the committed entry into the release PR body. Its separate automatic
draft remains a working list. This workflow does not start Codex, access a Codex
account, merge or publish anything. The owner-only **Sync release notes**
workflow remains available as a manual fallback from `develop`.
