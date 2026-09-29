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

## Tests
With the app open, in the browser console:
```js
document.head.append(Object.assign(document.createElement('script'),{src:'tests.js'}))
await __iltest()   // snapshots your data first and restores it afterwards
```
