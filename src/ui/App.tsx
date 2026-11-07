import { useEffect, useRef, useState } from 'react';
import { controller } from '../game/controller';
import { helpSeen, markHelpSeen } from '../game/settings';
import { useUiState } from './common';
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
  HelpScreen,
  PrisonersScreen,
  ProductionScreen,
  ResearchScreen,
  ScheduleScreen,
  StoryScreen,
  WorkScreen,
} from './screens';

// Layout: top bar and colonist bar across the top, inspector on the left, alerts and goals on
// the right, the architect menu along the bottom, and the map showing through the middle. Before
// a colony is under way, the title screen sits over the map instead.
export function App() {
  const state = useUiState();
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
    onPlay: () => setScreen(helpSeen() ? null : 'help'),
    onSettings: openFromMenu('settings'),
    onHelp: openFromMenu('help'),
    // The menu stays open (and the game paused) until the autosave is written.
    onTitle: async () => {
      if (await controller.quitToTitle()) {
        returnTo.current = null;
        setScreen(null);
      }
    },
  };

  // When the ship lands, the choice comes up by itself (once).
  const landed = state.ship === 'landed';
  useEffect(() => {
    if (landed) {
      setScreen('ship');
    }
  }, [landed]);
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

  // Interface size: scale everything from the top-left corner and give it the room to fill.
  const scale = state.settings.uiScale;
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
          <TitleScreen state={state} actions={actions} />
          {/* Load and save messages ("older version", "could not be loaded") show here too. */}
          <Notices state={state} />
        </>
      ) : (
        <>
          <TopBar state={state} onOpen={setScreen} />
          <ColonistBar state={state} />
          <div className="left-column">
            <Inspector state={state} />
          </div>
          <div className="right-column">
            <SidePanel state={state} onOpen={setScreen} />
            {state.settings.showMinimap && <Minimap />}
          </div>
          <div className="bottom">
            <HoverCard state={state} />
            <Architect state={state} />
          </div>
          <Notices state={state} paused={state.speed === 0 && !screen && !state.fallen} />
          {state.fallen && !screen && <FallenScreen state={state} actions={actions} />}
          {departed && !state.fallen && <DepartedScreen state={state} actions={actions} />}
          {screen === 'ship' && !departed && <ShipScreen state={state} onClose={close} />}
          {screen === 'menu' && <PauseMenu state={state} onClose={close} actions={actions} />}
          {screen === 'work' && <WorkScreen state={state} onClose={close} />}
          {screen === 'schedule' && <ScheduleScreen state={state} onClose={close} />}
          {screen === 'production' && <ProductionScreen state={state} onClose={close} />}
          {screen === 'research' && <ResearchScreen state={state} onClose={close} />}
          {screen === 'story' && <StoryScreen state={state} onClose={close} />}
          {screen === 'prisoners' && <PrisonersScreen state={state} onClose={close} />}
          {screen === 'trade' && <TradeScreen state={state} onClose={close} />}
        </>
      )}
      {screen === 'settings' && <SettingsScreen state={state} onClose={close} />}
      {screen === 'help' && <HelpScreen onClose={close} />}
    </div>
  );
}
