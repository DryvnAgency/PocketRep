// PocketRep — main app shell. Routes between tabs, owns orb state.
function CustomNavBar({ active, onSearch, onUpgrade, onOpenGameplan, orbState, setOrbState }) {
  const titles = {
    heat:     { title: 'Heat Sheet', sub: 'Tuesday · 248 active' },
    contacts: { title: 'Contacts',   sub: '248 total · 24 last 30d' },
    rex:      { title: 'Rex',        sub: 'Your AI co-pilot' },
    gameplan: { title: 'Gameplan',   sub: '2 live · 6 templates' },
    metrics:  { title: 'Metrics',    sub: 'April 2026' },
    profile:  { title: 'You',        sub: '34-month streak' },
  };
  const t = titles[active];

  return (
    <div style={{ padding: '54px 16px 10px', position: 'relative', zIndex: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        {/* PR mark · tap to upgrade */}
        <div
          onClick={onUpgrade}
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${T.gold2}, ${T.gold})`,
            color: T.base, fontWeight: 900, fontSize: 13,
            fontFamily: T.font, letterSpacing: -0.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(212,168,67,0.32), inset 0 1px 0 rgba(255,255,255,0.3)',
          }}>PR</div>
        <div style={{ flex: 1 }} />
        {/* search */}
        <div
          onClick={onSearch}
          style={{
            width: 36, height: 36, borderRadius: 18,
            background: T.surface2, border: `1px solid ${T.ink4}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="6" stroke={T.gold} strokeWidth="1.8"/>
            <path d="M16 16l4 4" stroke={T.gold} strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>
        {/* notifications */}
        <div style={{
          width: 36, height: 36, borderRadius: 18,
          background: T.surface2, border: `1px solid ${T.ink4}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', position: 'relative',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M5 17v-5a7 7 0 1114 0v5l1.5 2H3.5L5 17z" stroke={T.gold} strokeWidth="1.6" strokeLinejoin="round"/>
            <path d="M10 21a2 2 0 004 0" stroke={T.gold} strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          <div style={{
            position: 'absolute', top: 7, right: 8,
            width: 8, height: 8, borderRadius: 4,
            background: T.red, border: `1.5px solid ${T.surface2}`,
          }} />
        </div>
      </div>

      <div style={{
        fontSize: 30, fontWeight: 800, color: T.white,
        fontFamily: T.font, letterSpacing: -0.8, lineHeight: 1.1,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span>{t.title}</span>
        {active === 'contacts' && (
          <div
            onClick={onOpenGameplan}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 12px 6px 10px',
              background: `linear-gradient(180deg, ${T.goldBg} 0%, rgba(212,168,67,0.04) 100%)`,
              border: `1px solid ${T.goldBorder}`,
              borderRadius: 999, cursor: 'pointer',
              boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 6px 14px rgba(212,168,67,0.10)',
            }}>
            {/* mini sequence pipeline glyph */}
            <svg width="22" height="12" viewBox="0 0 22 12" fill="none">
              <circle cx="3" cy="6" r="2.5" fill={T.gold}/>
              <path d="M5.5 6h3" stroke={T.gold} strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="11" cy="6" r="2.5" fill={T.gold}/>
              <path d="M13.5 6h3" stroke={T.goldBorderStrong} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1.5 1.5"/>
              <circle cx="19" cy="6" r="2.5" stroke={T.gold} strokeWidth="1.4" fill="none"/>
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
              <span style={{
                fontSize: 13, fontWeight: 700, color: T.gold,
                fontFamily: T.font, letterSpacing: -0.1,
              }}>Game Plan</span>
              <span style={{
                fontSize: 9, fontWeight: 700, color: T.gold,
                fontFamily: T.font, letterSpacing: 0.5,
                textTransform: 'uppercase', opacity: 0.8,
                marginTop: 1,
              }}>2 live · 6 templates</span>
            </div>
            <span style={{ color: T.gold, fontSize: 14, marginLeft: 2 }}>›</span>
          </div>
        )}
      </div>
      <div style={{
        fontSize: 12, fontWeight: 500, color: T.gold,
        fontFamily: T.font, marginTop: 4, letterSpacing: 0.3,
        textTransform: 'uppercase',
      }}>{t.sub}</div>
    </div>
  );
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#d4a843",
  "bg": "#0c0c0e",
  "orbState": "idle"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [active, setActive] = React.useState('heat');
  const [selected, setSelected] = React.useState(null);
  const [orbState, setOrbState] = React.useState('idle');
  const [rexOpen, setRexOpen] = React.useState(false);
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [gameplanOpen, setGameplanOpen] = React.useState(false);
  const [onboardOpen, setOnboardOpen] = React.useState(false);
  const [deals, setDeals] = React.useState(DEALS);
  const [payPlan, setPayPlan] = React.useState(DEFAULT_PAY_PLAN);
  const [logDealOpen, setLogDealOpen] = React.useState(false);
  const [logDealPrefill, setLogDealPrefill] = React.useState(null);
  const [payPlanOpen, setPayPlanOpen] = React.useState(false);
  const [contacts, setContacts] = React.useState(CONTACTS);
  const [allTags, setAllTags] = React.useState(STARTER_TAGS);

  const updateContact = (next) => {
    setContacts(arr => arr.map(c => c.id === next.id ? next : c));
    if (selected && selected.id === next.id) setSelected(next);
  };
  const createTag = (name, color) => {
    if (allTags.some(t => t.name === name)) return;
    setAllTags(arr => [...arr, { name, color }]);
  };
  const applyTagToContacts = (tagName, contactIds) => {
    const idSet = new Set(contactIds);
    setContacts(arr => arr.map(c => {
      const has = (c.tags || []).includes(tagName);
      const should = idSet.has(c.id);
      if (has === should) return c;
      const tags = should
        ? [...(c.tags || []), tagName]
        : (c.tags || []).filter(t => t !== tagName);
      return { ...c, tags };
    }));
  };

  // Apply tweaks to root CSS vars
  React.useEffect(() => {
    document.documentElement.style.setProperty('--accent', t.accent);
    document.documentElement.style.setProperty('--bg', t.bg);
  }, [t.accent, t.bg]);

  // Quick orb demo cycle button (in Tweaks)
  const cycleOrb = () => {
    const order = ['idle', 'listening', 'processing', 'saved'];
    const i = (order.indexOf(orbState) + 1) % order.length;
    setOrbState(order[i]);
    if (order[i] === 'saved') {
      setTimeout(() => setOrbState('idle'), 1800);
    }
  };

  const openRex = () => {
    setOrbState('listening');
    setTimeout(() => setOrbState('processing'), 1400);
    setTimeout(() => {
      setOrbState('idle');
      setRexOpen(true);
      setActive('rex');
    }, 2400);
  };

  const openLogDeal = (prefillContact) => {
    setLogDealPrefill(prefillContact || null);
    setLogDealOpen(true);
  };
  const saveDeal = (deal) => {
    setDeals(d => [deal, ...d]);
  };

  const renderTab = () => {
    if (active === 'rex' || rexOpen) return <RexTab orbState={orbState} setOrbState={setOrbState} />;
    if (active === 'heat') return <HeatSheetTab onSelect={c => { setActive('contacts'); setSelected(c); }} />;
    if (active === 'contacts') return <ContactsTab
      onSelect={setSelected}
      selected={selected}
      onClose={() => setSelected(null)}
      deals={deals}
      onLogDeal={openLogDeal}
      contacts={contacts}
      onUpdateContact={updateContact}
      allTags={allTags}
      onCreateTag={createTag}
      onApplyTagToContacts={applyTagToContacts}
    />;
    if (active === 'metrics') return <MetricsTab deals={deals} onLogDeal={() => openLogDeal(null)} payPlan={payPlan} />;
    if (active === 'profile') return <ProfileTab onShowOnboarding={() => setOnboardOpen(true)} payPlan={payPlan} onEditPayPlan={() => setPayPlanOpen(true)} />;
  };

  const handleTab = (id) => {
    if (id === active) return;
    setActive(id);
    setSelected(null);
    if (id !== 'rex') setRexOpen(false);
  };

  // Allow Tweaks-driven orb state
  React.useEffect(() => {
    if (t.orbState && t.orbState !== orbState) {
      setOrbState(t.orbState);
      if (t.orbState === 'saved') {
        setTimeout(() => { setOrbState('idle'); setTweak('orbState', 'idle'); }, 1800);
      }
    }
  }, [t.orbState]);

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: '#0a0a0f',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {/* Backdrop accents */}
      <div style={{
        position: 'absolute', top: '20%', left: '30%',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(212,168,67,0.07) 0%, transparent 60%)',
        filter: 'blur(40px)', pointerEvents: 'none',
      }} />

      <IOSDevice dark={true} width={402} height={874}>
        <div style={{
          height: '100%', display: 'flex', flexDirection: 'column',
          background: T.base, position: 'relative',
        }}>
          {/* Custom nav (replaces default) */}
          <CustomNavBar active={active} orbState={orbState} setOrbState={setOrbState}
            onUpgrade={() => setUpgradeOpen(true)}
            onOpenGameplan={() => setGameplanOpen(true)} />

          {/* Content */}
          <div style={{
            flex: 1, overflowY: 'auto', overflowX: 'hidden',
            position: 'relative',
          }}>
            {renderTab()}
          </div>

          {/* Tab bar */}
          <TabBar
            active={active}
            setActive={handleTab}
            onOrbTap={openRex}
            orbState={orbState}
          />

          {/* Upgrade sheet */}
          <UpgradeSheet open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />

          {/* Onboarding */}
          <Onboarding open={onboardOpen} onClose={() => setOnboardOpen(false)} />

          {/* Deal logger */}
          <DealLogger
            open={logDealOpen}
            onClose={() => setLogDealOpen(false)}
            onSave={saveDeal}
            prefill={logDealPrefill}
            payPlan={payPlan}
          />

          {/* Pay plan editor */}
          <PayPlanEditor
            open={payPlanOpen}
            onClose={() => setPayPlanOpen(false)}
            plan={payPlan}
            setPlan={setPayPlan}
          />

          {/* Gameplan overlay */}
          {gameplanOpen && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 70,
              background: T.base,
              display: 'flex', flexDirection: 'column',
              animation: 'detailIn 220ms cubic-bezier(0.2,0.7,0.2,1)',
            }}>
              <div style={{
                padding: '52px 14px 12px',
                display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: `1px solid ${T.ink4}`,
                background: T.ink2,
              }}>
                <div
                  onClick={() => setGameplanOpen(false)}
                  style={{
                    width: 36, height: 36, borderRadius: 18,
                    background: T.surface2, border: `1px solid ${T.ink4}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: T.gold, fontSize: 18, cursor: 'pointer',
                  }}>‹</div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: 1.4,
                    color: T.gold, textTransform: 'uppercase', fontFamily: T.font,
                  }}>Game Plan</div>
                  <div style={{
                    fontSize: 18, fontWeight: 800, color: T.white,
                    fontFamily: T.font, letterSpacing: -0.4, marginTop: 2,
                  }}>Sequences & Templates</div>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <GameplanTab />
              </div>
            </div>
          )}
        </div>
      </IOSDevice>

      {/* Tweaks panel */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Orb">
          <TweakSelect
            label="Hey Rex"
            value={orbState}
            onChange={v => { setOrbState(v); if (v === 'saved') setTimeout(() => setOrbState('idle'), 1800); }}
            options={[
              { label: 'Idle', value: 'idle' },
              { label: 'Listening', value: 'listening' },
              { label: 'Processing', value: 'processing' },
              { label: 'Just saved', value: 'saved' },
            ]}
          />
          <TweakButton label="Cycle states" onClick={cycleOrb} />
        </TweakSection>

        <TweakSection label="Navigate">
          <TweakRadio
            label="Tab"
            value={active}
            onChange={handleTab}
            options={[
              { label: 'Heat', value: 'heat' },
              { label: 'Rex', value: 'rex' },
              { label: 'You', value: 'profile' },
            ]}
          />
          <TweakSelect
            label="Open"
            value={active}
            onChange={handleTab}
            options={[
              { label: 'Heat Sheet', value: 'heat' },
              { label: 'Contacts',   value: 'contacts' },
              { label: 'Rex chat',   value: 'rex' },
              { label: 'Metrics',    value: 'metrics' },
              { label: 'You',        value: 'profile' },
            ]}
          />
          <TweakButton label="Open contact detail" onClick={() => setSelected(CONTACTS[0])} />
          <TweakButton label="Open Game Plan" onClick={() => setGameplanOpen(true)} />
          <TweakButton label="Open onboarding" onClick={() => setOnboardOpen(true)} />
          <TweakButton label="Log a deal" onClick={() => openLogDeal(null)} />
          <TweakButton label="Edit pay plan" onClick={() => setPayPlanOpen(true)} />
          <TweakButton label="Open upgrade sheet" onClick={() => setUpgradeOpen(true)} />
        </TweakSection>

        <TweakSection label="Accent">
          <TweakColor
            label="Gold"
            value={t.accent}
            onChange={v => setTweak('accent', v)}
            options={['#d4a843', '#c0392b', '#2a8f5a', '#5a8fe8', '#a86bd1']}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
