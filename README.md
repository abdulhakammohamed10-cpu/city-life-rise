# CITY LIFE: RISE v1.6 — Enterable Apartment Tower

This build uses CITY LIFE: RISE v1.5 as the base and adds a first fully enterable multi-floor building.

## New building gameplay
- Enter the marked Apartment Tower near the west side of downtown.
- Press `E` at the entrance to open the sliding doors and enter.
- Walk around a lit interior lobby and furnished upper floors.
- Use the visible staircase to move continuously from floor to floor.
- HUD shows the current floor while inside.
- Press `E` near the lobby doorway on Floor 1 to exit.
- The exterior building remains collision-blocked when you are outside.
- The interior is hollow and walkable when you are inside.

## Controls
- `W A S D` — move
- `Mouse` — look
- `Shift` — sprint
- `Space` — jump
- `E` — enter / exit building and interact
- `V` — vehicle camera
- `L` — vehicle lights
- `R` — reload pulse pistol
- `LMB / F` — pulse pistol fire

## Run
```powershell
npm install
npm run dev
```

The package/dependency setup is kept based on the original v1.5 working project.

## Flight Mode
- Press **G** to deploy/fold the wings.
- **W/A/S/D** steer through the air.
- **Space** ascends.
- **Ctrl** descends.
- **Shift** boosts flight speed.
- Flight uses the player's energy and automatically folds the wings when energy is depleted.
