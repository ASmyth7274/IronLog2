# IronLog2
My workout tracker with templates and lots of features - All Rights Reserved, not for commercial use or duplication of any kind

## Version 5.8

**What's new**
- **A cleaner, calmer design.** Each screen has one clear main action. Menus are grouped, with anything destructive set apart at the end, and one icon family is used throughout. During a workout, a bar stays pinned at the top with the clock, sets done and Finish. Explanations fold away until you want them. The light theme's switches now read correctly when on.
- **Today** on the Log tab. Start today's scheduled template in one tap, see this week at a glance, and pick any template. The exercise picker opens on your most recently trained exercises.
- **Edit a finished workout** from History: a mistyped weight, a forgotten Finish, the start time or a note. Records and trophies are recalculated from that workout onwards. Earlier sessions are never touched.
- **Technogym presets** for the movement plotter. There are 32 Selection, Pure Strength and cable-station machines. **Settings → Exercise library → To calibrate → Calibrate with Technogym presets** does your whole library in one go. **Measure it** turns two tape measurements into any machine's exact leverage.
- **iOS 27 fixes for the Home Screen app.** The blurred band across the top of the screen is gone. So is a too-short window the keyboard can leave behind. Returning from the background reliably refreshes the app. Every ticked set is saved at once.
- **The 5.7 review fixes.** Restoring a backup is all-or-nothing. PREV matches warm-ups to warm-ups. Trophies follow every edit. Double taps can't double-save. Dates are your local dates. The session saves as the app is hidden. The service worker copes with one bar of signal.
- **A fairer strength score.** Sets past 12 reps are read as 12, because beyond that they measure endurance. A bodyweight lift counts the share of you it actually raises: about two-thirds for a push-up, all of you for a pull-up, and nothing for a plank. Thirty push-ups no longer outrank a 100 kg bench, so your score may drop a little if high-rep sets were propping it up. Records and PRs are unchanged.
- **Switching kg ↔ lb converts.** Every logged weight, template target, body weight, bar and plate set is converted in one go, and distances switch between km and mi. It either all converts or nothing changes. Converting back gives exactly what you logged. "Only change the label" is there if you've been logging in the other unit all along.
- **Your record on every exercise card.** Each exercise in a workout shows the set to beat: your best before today ("PR 107.5 kg × 5"), plus your heaviest if that was a different set, or furthest and longest for cardio. It turns gold the moment a set beats it, and tapping it opens the exercise's history.
- **An exercise's history, mid-workout.** Tap an exercise's name (or ⋯ → History) to see every session with its sets, your records and a sparkline of your best set each time.
- **Forgot to press Finish?** After two hours without a ticked set, the workout offers to finish at your last set. Its duration and date come out right, instead of running on to the next morning.
- **Updates reach your phone by themselves.** IronLog checks for a new version when it opens and when you come back to it, then offers a one-tap **Update** on the Log tab. A workout in progress is saved first. **Settings → About** shows your version and has **Check for updates**.
- **Charts work offline from the very first launch.** Chart.js now ships with the app instead of coming from a CDN.
- **Tests run on every push** (GitHub Actions, in three time zones).

## Updating from 5.7
There's nothing to do. 5.8 reads 5.7 data exactly as it is and doesn't change how anything is stored: the same database version, the same stores and the same backup format. New information is only ever added alongside the old (a machine calibrated from a preset remembers which preset). So you can go back to 5.7 at any time, and backup files move freely between the two versions. Saving a backup first is still a good habit: **Settings → Your data → Save a backup file**.

This was checked on real browser storage:
- A 5.7 install with nine weeks of training was opened by 5.8, and every record read back identical, including the in-progress workout.
- 5.8 then added preset calibrations, an edited workout and a newly ticked set, and 5.7 opened it all again without an error.
- Each version imported the other's backup file record for record.

The in-app test suite guards the same rules: the database version and stores, the backup format, and the fact that every new field is optional.

### iPhone: if the top of the screen still looks blurred
iOS remembers the status-bar style from the day the app was added to the Home Screen. If the blur is still there after updating:
1. **Settings → Your data → Save a backup file.** Removing the app deletes everything stored in it, so do this first.
2. Remove IronLog from the Home Screen.
3. Open the site in Safari → Share → **Add to Home Screen**.
4. Open the new icon, then **Settings → Your data → Restore from a backup**. Each Home Screen app has its own storage, separate from Safari's, so restore inside the app itself.

## Technogym presets
Technogym doesn't publish leverage figures for its machines. The presets use the typical ratio for each mechanism:
- a direct cable is 1:1
- a 2:1 pulley is ×0.5
- cam and lever machines are ×0.45–0.75
- a sled is the sine of its angle

For the exact figure on your gym's machine, open it in the plotter and use **Measure it**. In one slow rep, measure how far your hands move and how far the weight rises.

## Publishing (GitHub Pages)
Pages serves whichever branch is chosen in **Settings → Pages** on GitHub. To publish 5.8:
1. Under **Build and deployment**, choose **Deploy from a branch**.
2. Pick `5.8` and `/ (root)`, then save.

Switching back to `5.7` is just as safe (see *Updating from 5.7*).

### Getting the update onto your phone
Pages takes a minute or two to publish. After that, the installed app picks up the new version the next time it starts with a connection.

5.7 can't tell you an update is waiting. If it's still showing 5.7, close IronLog fully (swipe it away in the app switcher) and open it again. **Settings → About** shows the version you're running.

From 5.8 on, the app checks by itself and offers **Update** on the Log tab.

## Tests
Every push runs the full suite in headless Chromium (**Actions → tests**), in London, Los Angeles and Auckland time.

To run it yourself, with the app open, in the browser console:
```js
document.head.append(Object.assign(document.createElement('script'),{src:'tests.js'}))
await __iltest()   // snapshots your data first and restores it afterwards
```

Or from a terminal:
```sh
npm i --no-save playwright && npx playwright install chromium
node ci/run-tests.mjs
```

Chart.js 4.5.1 is included under its MIT licence (`vendor/`).
