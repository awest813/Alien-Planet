import { useEffect, useState } from 'react';
import { useUiState } from './common';
import { Architect, ColonistBar, HoverCard, Inspector, Notices, Screen, SidePanel, TopBar } from './hud';
import { HelpScreen, Menu, ProductionScreen, ResearchScreen, ScheduleScreen, StoryScreen, WorkScreen } from './screens';

const HELP_SEEN_KEY = 'colony-alpha:help-seen';

// Browser storage can be unavailable (private mode, blocked site data), so never let it throw.
function helpSeen(): boolean {
  try {
    return localStorage.getItem(HELP_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markHelpSeen(): void {
  try {
    localStorage.setItem(HELP_SEEN_KEY, '1');
  } catch {
    // Not remembered; the help panel will show again next time.
  }
}

// Layout: top bar and colonist bar across the top, inspector on the left, alerts and goals on
// the right, the architect menu along the bottom, and the map showing through the middle.
export function App() {
  const state = useUiState();
  const [screen, setScreen] = useState<Screen>(() => (helpSeen() ? null : 'help'));
  const close = () => {
    if (screen === 'help') {
      markHelpSeen();
    }
    setScreen(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setScreen(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="ui">
      <TopBar state={state} onOpen={setScreen} />
      <ColonistBar state={state} />
      <div className="left-column">
        <Inspector state={state} />
      </div>
      <div className="right-column">
        <SidePanel state={state} />
      </div>
      <div className="bottom">
        <HoverCard state={state} />
        <Architect state={state} />
      </div>
      <Notices state={state} />
      {screen === 'menu' && <Menu state={state} onClose={close} />}
      {screen === 'work' && <WorkScreen state={state} onClose={close} />}
      {screen === 'schedule' && <ScheduleScreen state={state} onClose={close} />}
      {screen === 'production' && <ProductionScreen state={state} onClose={close} />}
      {screen === 'research' && <ResearchScreen state={state} onClose={close} />}
      {screen === 'story' && <StoryScreen state={state} onClose={close} />}
      {screen === 'help' && <HelpScreen onClose={close} />}
    </div>
  );
}
