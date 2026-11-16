# Amina & Omar — Wedding Website Demo

Client demo of our static wedding invitation site. Layout, motion, and RSVP form match the production template; names, date, and venue are sample copy only.

Couple: **Amina Noor & Omar Malik**  
Date: **19 June 2027**  
Venue: **The Garden Pavilion, Canal Bank Road, Lahore**

## Run locally

### Option A: Node static server

```bash
npx serve .
```

### Option B: Python

```bash
python -m http.server 5173
```

Then open `http://localhost:5173/`.

## Project structure

- `index.html`: single landing page
- `styles/main.css`: loads fonts + compiled CSS
- `scripts/main.js`: countdown, reveal animations, mute toggle, RSVP demo handling
- `assets/`: images, audio, and fonts
