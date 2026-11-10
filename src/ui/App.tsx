import { TOUCH } from './touch';
import { useEffect, useRef, useState } from 'react';
import { UiState, controller } from '../game/controller';
import { helpSeen, markHelpSeen } from '../game/settings';
import { useUi } from './common';
import { Architect, ColonistBar, HoverCard, Inspector, Notices, Screen, SidePanel, TopBar } from './hud';
import {
  DepartedScreen,
  FallenScreen,
  MenuActions,
  PauseMenu,
  SettingsScreen,
  ShipScreen,
  TitleScreen,
  TradeScreen,
} from './menus';
import { Minimap } from './minimap';
import {
  ColonistsScreen,
  HelpScreen,
  PrisonersScreen,
  VillageScreen,
  FactionsScreen,
  ProductionScreen,
  ResearchScreen,
  ScheduleScreen,
  StoryScreen,
  WorkScreen,
} from './screens';

// Layout: top bar and colonist bar across the top, inspector on the left, alerts and goals on
// the right, the architect menu along the bottom, and the map showing through the middle. Before
// a colony is under way, the title screen sits over the map instead.
// (Each panel and screen watches the part of the state it shows; the App only what decides which are up.)
const pickApp = (s: UiState) => ({
  inPlay: s.inPlay,
  ship: s.ship,
  fallen: s.fallen,
  speed: s.speed,
  uiScale: s.settings.uiScale,
  showMinimap: s.settings.showMinimap,
});

export function App() {
  const state = useUi(pickApp);
  const onTitle = !state.inPlay;
  const [screen, setScreen] = useState<Screen>(null);
  // Settings and help opened from the pause menu go back to it when closed, not to the game.
  const returnTo = useRef<Screen>(null);
  const back = (from: Screen) => {
    if (from === 'help') {
      markHelpSeen();
    }
    setScreen(returnTo.current);
    returnTo.current = null;
  };
  const close = () => back(screen);
  const openFromMenu = (next: Screen) => () => {
    returnTo.current = screen === 'menu' ? 'menu' : null;
    setScreen(next);
  };

  const actions: MenuActions = {
    // A new player gets the welcome help as their first colony starts.
    // (A game loaded with the ship waiting opens on its choice: this runs after the effect below, and closed it.)
    onPlay: () => setScreen(controller.getState().ship === 'landed' ? 'ship' : helpSeen() ? null : 'help'),
    onSettings: openFromMenu('settings'),
    onHelp: openFromMenu('help'),
    onStory: () => setScreen('story'),
    // The menu stays open (and the game paused) until the autosave is written.
    onTitle: async () => {
      if (await controller.quitToTitle()) {
        returnTo.current = null;
        setScreen(null);
      }
    },
  };

  // When the ship lands, the choice comes up by itself (once), and again when a game saved with the ship waiting
  // is loaded (it didn't, and the clock ran down its wait with no way to choose in sight).
  const landed = state.ship === 'landed';
  useEffect(() => {
    if (landed && !onTitle) {
      setScreen('ship');
    }
  }, [landed, onTitle]);
  const departed = state.ship === 'departed';
  // Boarding ends the story: whatever screen was open closes behind the ending.
  useEffect(() => {
    if (departed) {
      setScreen(null);
    }
  }, [departed]);

  // Game hotkeys stand aside while any menu or screen is open.
  const anyScreen = onTitle || screen !== null || state.fallen || departed;
  useEffect(() => {
    controller.modalOpen = anyScreen;
  }, [anyScreen]);
  // A screen opened over the map: a toast about the map is dropped, and only what the screen says shows over it.
  useEffect(() => {
    if (screen !== null) {
      controller.dropToast();
    }
  }, [screen]);

  // The title screen, help, settings and the pause menu stop the clock while they're open.
  const pausing =
    onTitle ||
    departed ||
    screen === 'help' ||
    screen === 'menu' ||
    screen === 'settings' ||
    screen === 'trade' ||
    screen === 'ship';
  useEffect(() => {
    if (pausing) {
      controller.holdPause();
    } else {
      controller.releasePause();
    }
  }, [pausing]);

  // Escape peels back one layer at a time: an open screen, then the current tool, then the
  // selection, and finally opens the pause menu.
  const latest = useRef({ screen, onTitle, back });
  latest.current = { screen, onTitle, back };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Held keys repeat, which would flicker the pause menu open and shut.
      if (e.key !== 'Escape' || e.repeat) {
        return;
      }
      // Esc while typing (the seed, say) just leaves the field. Checkboxes, sliders and buttons
      // don't count: Esc closes the screen as usual.
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'TEXTAREA' ||
          (target instanceof HTMLInputElement &&
            !['checkbox', 'radio', 'range', 'button', 'submit', 'color'].includes(target.type)));
      if (typing) {
        target.blur();
        return;
      }
      const open = latest.current.screen;
      if (open) {
        latest.current.back(open);
      } else if (latest.current.onTitle || controller.getState().fallen || controller.getState().ship === 'departed') {
        // Nothing to back out of.
      } else if (controller.tool.kind !== 'select') {
        controller.setTool({ kind: 'select' });
        // The tool's button keeps focus otherwise, and its focus ring looks like a tool still in hand.
        // (Not for someone working the keyboard, whose focus mustn't drop back to the page.)
        if (
          document.activeElement instanceof HTMLElement &&
          document.activeElement.closest('.architect') &&
          !document.activeElement.matches(':focus-visible')
        ) {
          document.activeElement.blur();
        }
      } else if (controller.selectedColonist !== null || controller.selectedTile !== null) {
        controller.selectColonist(null);
        controller.selectTile(null);
      } else {
        setScreen('menu');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A HUD button clicked with the mouse (not a dialog's) lets go of the focus afterwards, so the game's keys
  // (Tab to the next colonist, Space to pause) keep working rather than going to that button. Buttons pressed
  // from the keyboard keep it.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const button = (e.target as HTMLElement | null)?.closest?.('button');
      if (button && e.detail > 0 && !button.closest('.modal') && document.activeElement === button) {
        button.blur();
      }
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, []);

  // On a touch screen there's no hovering to read why a button is off: a tap on one says it instead (from its
  // tooltip). Found by position, since a disabled button gets no clicks of its own.
  useEffect(() => {
    if (!TOUCH) {
      return;
    }
    const onUp = (e: PointerEvent) => {
      // (Only the button on top: one hidden behind a dialog said its piece when the dialog was tapped.)
      const off = document.elementFromPoint(e.clientX, e.clientY)?.closest('button');
      if (off?.disabled && off.title) {
        controller.hint(off.title);
      }
    };
    window.addEventListener('pointerup', onUp, true);
    return () => window.removeEventListener('pointerup', onUp, true);
  }, []);

  // Interface size: scale everything from the top-left corner and give it the room to fill.
  const scale = state.uiScale;
  const scaled =
    scale === 1
      ? undefined
      : {
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          width: `${100 / scale}vw`,
          height: `${100 / scale}vh`,
          right: 'auto',
          bottom: 'auto',
        };

  return (
    <div className="ui" style={scaled}>
      {onTitle ? (
        <>
          <TitleScreen actions={actions} />
          {/* Load and save messages ("older version", "could not be loaded") show here too. */}
          <Notices />
        </>
      ) : (
        <>
          <TopBar onOpen={setScreen} />
          <ColonistBar onOpen={setScreen} />
          <div className="left-column">
            <Inspector />
          </div>
          <div className="right-column">
            <SidePanel onOpen={setScreen} />
            {state.showMinimap && <Minimap />}
          </div>
          <div className="bottom">
            <HoverCard />
            <Architect />
          </div>
          <Notices paused={state.speed === 0 && !screen && !state.fallen && !departed} />
          {state.fallen && !screen && <FallenScreen actions={actions} />}
          {departed && !state.fallen && !screen && <DepartedScreen actions={actions} />}
          {screen === 'ship' && !departed && <ShipScreen onClose={close} />}
          {screen === 'menu' && <PauseMenu onClose={close} actions={actions} />}
          {screen === 'work' && <WorkScreen onClose={close} />}
          {screen === 'schedule' && <ScheduleScreen onClose={close} />}
          {screen === 'production' && <ProductionScreen onClose={close} />}
          {screen === 'research' && <ResearchScreen onClose={close} />}
          {screen === 'story' && <StoryScreen onClose={close} />}
          {screen === 'prisoners' && <PrisonersScreen onClose={close} />}
          {screen === 'village' && <VillageScreen onClose={close} />}
          {screen === 'factions' && <FactionsScreen onClose={close} />}
          {screen === 'colonists' && <ColonistsScreen onClose={close} />}
          {screen === 'trade' && <TradeScreen onClose={close} />}
        </>
      )}
      {screen === 'settings' && <SettingsScreen onClose={close} />}
      {screen === 'help' && <HelpScreen onClose={close} />}
    </div>
  );
}
