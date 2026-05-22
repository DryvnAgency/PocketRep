// Contact list — search, swipeable tag carousel, tag-create + bulk-assign flow
function ContactRow({ c, onTap, selectable, selected, onToggleSelect, allTags }) {
  const tier = TIERS[c.tier];
  const tagColor = (name) => {
    const t = (allTags || []).find(t => t.name === name);
    return t ? t.color : T.gold;
  };
  return (
    <div
      onClick={selectable ? onToggleSelect : onTap}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px',
        cursor: 'pointer',
        borderBottom: `1px solid ${T.ink3}`,
        background: selected ? T.goldBg : 'transparent',
        transition: 'background 120ms',
      }}
    >
      {selectable && (
        <div style={{
          width: 22, height: 22, borderRadius: 11,
          border: `2px solid ${selected ? T.gold : T.ink4}`,
          background: selected ? T.gold : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {selected && (
            <svg width="11" height="9" viewBox="0 0 14 12">
              <path d="M1 6l4 4 8-9" stroke={T.base} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      )}
      {c.photo ? (
        <img src={c.photo} alt={c.name} style={{
          width: 40, height: 40, borderRadius: 20, objectFit: 'cover',
          border: `1px solid ${T.goldBorder}`, flexShrink: 0,
        }} />
      ) : (
        <Avatar name={c.name} size={40} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 600, color: T.white,
          fontFamily: T.font, letterSpacing: -0.2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{c.name}</div>
        <div style={{
          fontSize: 11, color: T.grey2, fontFamily: T.font,
          marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{c.vehicle}</div>
        {(c.tags || []).length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
            {(c.tags || []).slice(0, 3).map(t => (
              <span key={t} style={{
                fontSize: 9, fontWeight: 700,
                padding: '1px 6px', borderRadius: 999,
                color: tagColor(t),
                background: `color-mix(in oklab, ${tagColor(t)} 12%, transparent)`,
                border: `1px solid color-mix(in oklab, ${tagColor(t)} 30%, transparent)`,
                letterSpacing: 0.3, fontFamily: T.font,
              }}>{t}</span>
            ))}
          </div>
        )}
      </div>
      <div style={{
        width: 8, height: 8, borderRadius: 4,
        background: tier.color, flexShrink: 0,
      }} />
    </div>
  );
}

function ContactsTab({ onSelect, selected, onClose, deals, onLogDeal, contacts, onUpdateContact, allTags, onCreateTag, onApplyTagToContacts }) {
  const [query, setQuery] = React.useState('');
  const [filterTag, setFilterTag] = React.useState(null); // null = all
  const [bulkOpen, setBulkOpen] = React.useState(false);

  // Tier-as-virtual-tag for the carousel
  const TIER_TAGS = [
    { name: 'Hot',   color: T.red,    tier: 'hot',   icon: '🔥' },
    { name: 'Warm',  color: T.orange, tier: 'warm',  icon: '☀️' },
    { name: 'Watch', color: T.grey2,  tier: 'watch', icon: '👁' },
  ];

  // Match contact against active filter
  const matchesFilter = (c) => {
    if (!filterTag) return true;
    if (filterTag.tier) return c.tier === filterTag.tier;
    return (c.tags || []).includes(filterTag.name);
  };

  const filtered = contacts.filter(c => {
    const q = query.toLowerCase();
    const matchesQ = !q ||
      c.name.toLowerCase().includes(q) ||
      c.vehicle.toLowerCase().includes(q) ||
      (c.tags || []).some(t => t.toLowerCase().includes(q));
    return matchesQ && matchesFilter(c);
  });

  // Group by first letter
  const groups = {};
  filtered.forEach(c => {
    const k = c.name[0].toUpperCase();
    if (!groups[k]) groups[k] = [];
    groups[k].push(c);
  });
  const letters = Object.keys(groups).sort();

  // Combined chips for the swipeable carousel
  // [All] [Hot] [Warm] [Watch] [custom tags…] [+ Add tag]
  const renderChip = (chip, key) => {
    const isAll = chip === 'all';
    const isAdd = chip === 'add';
    const active = isAll ? filterTag === null :
                   chip.tier ? filterTag && filterTag.tier === chip.tier :
                   filterTag && !filterTag.tier && filterTag.name === chip.name;
    const color = isAll ? T.gold : chip.color || T.gold;

    if (isAdd) {
      return (
        <div
          key={key}
          onClick={() => setBulkOpen(true)}
          style={{
            padding: '7px 13px', flexShrink: 0,
            background: 'transparent',
            border: `1.5px dashed ${T.goldBorder}`,
            borderRadius: 999, cursor: 'pointer',
            fontSize: 12, fontWeight: 700,
            color: T.gold,
            fontFamily: T.font, letterSpacing: 0.3,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            scrollSnapAlign: 'start',
          }}>
          ＋ <span style={{ marginLeft: 1 }}>Tag</span>
        </div>
      );
    }

    return (
      <div
        key={key}
        onClick={() => setFilterTag(isAll ? null : chip)}
        style={{
          padding: '7px 13px', flexShrink: 0,
          background: active ? color : T.surface2,
          border: `1px solid ${active ? color : T.ink4}`,
          borderRadius: 999, cursor: 'pointer',
          fontSize: 12, fontWeight: 700,
          color: active ? (color === T.gold ? T.base : T.white) : T.grey3,
          fontFamily: T.font, letterSpacing: 0.3,
          display: 'inline-flex', alignItems: 'center', gap: 5,
          scrollSnapAlign: 'start',
          transition: 'all 140ms',
        }}>
        {chip.icon && <span style={{ fontSize: 11 }}>{chip.icon}</span>}
        {!chip.icon && !isAll && (
          <span style={{
            width: 6, height: 6, borderRadius: 3,
            background: active ? (color === T.gold ? T.base : T.white) : color,
          }} />
        )}
        {isAll ? 'All' : chip.name}
      </div>
    );
  };

  return (
    <div style={{ paddingBottom: 20 }}>
      {/* Search */}
      <div style={{ padding: '12px 14px 8px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: T.surface2, border: `1px solid ${T.ink4}`,
          borderRadius: 10, padding: '0 12px',
        }}>
          <span style={{ color: T.ghost, fontSize: 14 }}>⌕</span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search ${contacts.length} contacts`}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              outline: 'none', color: T.white, fontSize: 14,
              fontFamily: T.font, padding: '10px 0',
            }}
          />
          {query && (
            <span onClick={() => setQuery('')} style={{ color: T.gold, cursor: 'pointer', fontSize: 14 }}>✕</span>
          )}
        </div>
      </div>

      {/* Swipeable tag carousel */}
      <div style={{
        display: 'flex', gap: 7, padding: '4px 14px 10px',
        overflowX: 'auto',
        scrollSnapType: 'x proximity',
        WebkitOverflowScrolling: 'touch',
      }}>
        {renderChip('all', 'all')}
        {TIER_TAGS.map(t => renderChip(t, `tier-${t.tier}`))}
        {allTags.map(t => renderChip(t, `tag-${t.name}`))}
        {renderChip('add', 'add')}
      </div>

      {/* Filter active hint */}
      {filterTag && (
        <div style={{
          margin: '0 14px 4px',
          padding: '8px 12px',
          background: T.goldBg, border: `1px solid ${T.goldBorder}`,
          borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.0,
            color: T.gold, textTransform: 'uppercase',
          }}>FILTER</span>
          <span style={{
            fontSize: 12, fontWeight: 600, color: T.white,
            fontFamily: T.font, letterSpacing: -0.1,
          }}>{filterTag.icon ? `${filterTag.icon} ${filterTag.name}` : filterTag.name}</span>
          <span style={{
            fontSize: 11, color: T.grey2, fontFamily: T.font,
            fontVariantNumeric: 'tabular-nums',
          }}>· {filtered.length} contact{filtered.length === 1 ? '' : 's'}</span>
          <div style={{ flex: 1 }} />
          <span
            onClick={() => setFilterTag(null)}
            style={{
              fontSize: 11, fontWeight: 700, color: T.gold,
              cursor: 'pointer', letterSpacing: 0.3,
              textTransform: 'uppercase',
            }}>Clear</span>
        </div>
      )}

      {/* Sectioned list */}
      {letters.length === 0 && (
        <div style={{
          margin: '16px 14px',
          padding: '32px 16px',
          textAlign: 'center',
          background: T.surface2, border: `1px solid ${T.ink4}`,
          borderRadius: 12,
        }}>
          <div style={{ fontSize: 14, color: T.grey2, fontFamily: T.font }}>No matches</div>
        </div>
      )}
      {letters.map(L => (
        <div key={L}>
          <div style={{
            padding: '12px 16px 4px',
            fontSize: 11, fontWeight: 700, color: T.gold,
            letterSpacing: 1.2, fontFamily: T.font,
            background: T.base,
          }}>{L}</div>
          <div style={{
            margin: '0 14px',
            background: T.surface2,
            border: `1px solid ${T.ink4}`,
            borderRadius: 12, overflow: 'hidden',
          }}>
            {groups[L].map((c) => (
              <ContactRow key={c.id} c={c} onTap={() => onSelect(c)} allTags={allTags} />
            ))}
          </div>
        </div>
      ))}

      {/* Detail overlay */}
      {selected && (
        <ContactDetail
          c={contacts.find(x => x.id === selected.id) || selected}
          onClose={onClose}
          deals={deals}
          onLogDeal={onLogDeal}
          onUpdate={onUpdateContact}
          allTags={allTags}
        />
      )}

      {/* Bulk tag-assign overlay */}
      {bulkOpen && (
        <BulkTagFlow
          contacts={contacts}
          allTags={allTags}
          onClose={() => setBulkOpen(false)}
          onApply={(tagName, color, contactIds) => {
            // Create tag if it's new
            const exists = allTags.some(t => t.name === tagName);
            if (!exists) onCreateTag(tagName, color);
            onApplyTagToContacts(tagName, contactIds);
            setBulkOpen(false);
            setFilterTag({ name: tagName, color: color || (allTags.find(t => t.name === tagName) || {}).color || T.gold });
          }}
        />
      )}
    </div>
  );
}

// Bulk tag flow — pick or create a tag, then multi-select contacts
function BulkTagFlow({ contacts, allTags, onClose, onApply }) {
  // 'choose' (pick tag / create) → 'select' (multi-select contacts)
  const [step, setStep] = React.useState('choose');
  const [chosenTag, setChosenTag] = React.useState(null); // { name, color }
  const [newName, setNewName] = React.useState('');
  const [newColor, setNewColor] = React.useState(T.gold);
  const [picked, setPicked] = React.useState(new Set());
  const [q, setQ] = React.useState('');

  const COLORS = [T.gold, T.red, T.orange, T.green, '#5a8fe8', '#a86bd1', T.grey2];

  const filtered = contacts.filter(c =>
    !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.vehicle.toLowerCase().includes(q.toLowerCase())
  );

  const togglePick = (id) => {
    const n = new Set(picked);
    n.has(id) ? n.delete(id) : n.add(id);
    setPicked(n);
  };

  const goToSelect = (tag) => {
    setChosenTag(tag);
    // Pre-fill: contacts that already have this tag
    setPicked(new Set(contacts.filter(c => (c.tags || []).includes(tag.name)).map(c => c.id)));
    setStep('select');
  };

  const handleSave = () => {
    if (!chosenTag || picked.size === 0) return;
    onApply(chosenTag.name, chosenTag.color, Array.from(picked));
  };

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 90,
      animation: 'fadeIn 200ms ease-out',
    }}>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(5,5,8,0.75)',
        backdropFilter: 'blur(6px)',
      }} />

      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, top: '7%',
        background: T.ink2, border: `1px solid ${T.goldBorder}`,
        borderRadius: '24px 24px 0 0',
        animation: 'sheetUp 320ms cubic-bezier(0.2,0.7,0.2,1)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 42, height: 4, borderRadius: 2, background: T.ink4 }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 16px 16px',
          borderBottom: `1px solid ${T.ink4}`,
        }}>
          <div
            onClick={step === 'choose' ? onClose : () => setStep('choose')}
            style={{
              padding: '7px 14px', borderRadius: 16,
              background: T.surface2, border: `1px solid ${T.ink4}`,
              color: T.grey2, fontSize: 12, fontWeight: 600,
              fontFamily: T.font, cursor: 'pointer',
            }}>{step === 'choose' ? 'Cancel' : '‹ Back'}</div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
              color: T.gold, textTransform: 'uppercase', fontFamily: T.font,
            }}>{step === 'choose' ? 'STEP 1 OF 2' : 'STEP 2 OF 2'}</div>
            <div style={{
              fontSize: 14, fontWeight: 700, color: T.white,
              fontFamily: T.font, marginTop: 2, letterSpacing: -0.2,
            }}>{step === 'choose' ? 'Choose a tag' : `Tag ${picked.size} contact${picked.size === 1 ? '' : 's'}`}</div>
          </div>
          {step === 'select' && (
            <div
              onClick={handleSave}
              style={{
                padding: '7px 14px', borderRadius: 16,
                background: picked.size > 0 ? T.gold : T.ink4,
                color: picked.size > 0 ? T.base : T.ghost,
                fontSize: 12, fontWeight: 700, fontFamily: T.font,
                cursor: picked.size > 0 ? 'pointer' : 'default',
              }}>Apply</div>
          )}
          {step === 'choose' && <div style={{ width: 56 }} />}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {step === 'choose' && (
            <>
              {/* Create new tag */}
              <div style={{ padding: '16px' }}>
                <Label color={T.gold}>CREATE NEW TAG</Label>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. Murano, F-150, Spring buyer"
                    style={{
                      flex: 1,
                      background: T.surface2, border: `1px solid ${T.ink4}`,
                      borderRadius: 10, padding: '11px 12px',
                      color: T.white, fontSize: 14, fontWeight: 600,
                      fontFamily: T.font, outline: 'none', letterSpacing: -0.1,
                    }}
                  />
                  <div
                    onClick={() => {
                      if (!newName.trim()) return;
                      goToSelect({ name: newName.trim(), color: newColor });
                    }}
                    style={{
                      padding: '11px 14px', borderRadius: 10,
                      background: newName.trim() ? T.gold : T.ink4,
                      color: newName.trim() ? T.base : T.ghost,
                      fontSize: 12, fontWeight: 700, fontFamily: T.font,
                      letterSpacing: 0.3, cursor: newName.trim() ? 'pointer' : 'default',
                      textTransform: 'uppercase',
                    }}>Next ›</div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: T.grey2,
                    letterSpacing: 0.8, textTransform: 'uppercase',
                    fontFamily: T.font,
                  }}>COLOR</span>
                  {COLORS.map(co => (
                    <div
                      key={co}
                      onClick={() => setNewColor(co)}
                      style={{
                        width: 22, height: 22, borderRadius: 11,
                        background: co, cursor: 'pointer',
                        border: `2px solid ${newColor === co ? T.white : 'transparent'}`,
                        boxSizing: 'border-box',
                      }} />
                  ))}
                </div>
              </div>

              <SectionHead label="OR PICK EXISTING" color={T.grey2} />
              <div style={{
                padding: '0 14px 16px',
                display: 'flex', flexWrap: 'wrap', gap: 6,
              }}>
                {allTags.map(t => (
                  <div
                    key={t.name}
                    onClick={() => goToSelect(t)}
                    style={{
                      padding: '9px 14px', borderRadius: 999, cursor: 'pointer',
                      background: `color-mix(in oklab, ${t.color} 12%, transparent)`,
                      border: `1.5px solid color-mix(in oklab, ${t.color} 35%, transparent)`,
                      fontSize: 13, fontWeight: 700,
                      color: t.color, fontFamily: T.font,
                      letterSpacing: 0.3,
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: t.color }} />
                    {t.name}
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 'select' && (
            <>
              {/* Tag preview */}
              <div style={{
                margin: '14px 14px 0',
                padding: '12px 14px',
                background: `color-mix(in oklab, ${chosenTag.color} 14%, transparent)`,
                border: `1px solid color-mix(in oklab, ${chosenTag.color} 40%, transparent)`,
                borderRadius: 12,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: chosenTag.color, flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <Label color={chosenTag.color}>APPLYING TAG</Label>
                  <div style={{
                    fontSize: 16, fontWeight: 700, color: T.white,
                    fontFamily: T.font, letterSpacing: -0.2, marginTop: 2,
                  }}>{chosenTag.name}</div>
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 800, color: chosenTag.color,
                  fontFamily: T.font, fontVariantNumeric: 'tabular-nums',
                }}>{picked.size}</div>
              </div>

              {/* Search */}
              <div style={{ padding: '12px 14px 8px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: T.surface2, border: `1px solid ${T.ink4}`,
                  borderRadius: 10, padding: '0 12px',
                }}>
                  <span style={{ color: T.ghost, fontSize: 14 }}>⌕</span>
                  <input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Search contacts"
                    style={{
                      flex: 1, background: 'transparent', border: 'none',
                      outline: 'none', color: T.white, fontSize: 14,
                      fontFamily: T.font, padding: '10px 0',
                    }}
                  />
                </div>
              </div>

              {/* Picker list */}
              <div style={{
                margin: '0 14px',
                background: T.surface2,
                border: `1px solid ${T.ink4}`,
                borderRadius: 12, overflow: 'hidden',
              }}>
                {filtered.map((c) => (
                  <ContactRow
                    key={c.id}
                    c={c}
                    selectable
                    selected={picked.has(c.id)}
                    onToggleSelect={() => togglePick(c.id)}
                    allTags={allTags}
                  />
                ))}
              </div>
              <div style={{ height: 30 }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ContactsTab });
