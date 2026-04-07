// ─────────────────────────────────────────────────────────────────────────────
// HeyRexOrb — paste this function + orbS styles into your Snack App.js
//
// PLACEMENT: just above your App() function
//
// USAGE in App render (inside your main-view, after <TabBar>):
//   <HeyRexOrb user={user} activeTab={activeTab} />
//
// REQUIRES these to already exist in your Snack file:
//   C (color constants)
//   Animated, PanResponder, Dimensions, Modal, Pressable,
//   TouchableOpacity, TextInput, ScrollView, ActivityIndicator,
//   StyleSheet, Text, View  — all from react-native
// ─────────────────────────────────────────────────────────────────────────────

function HeyRexOrb({ user, activeTab }) {
  const [stage, setStage] = React.useState('idle'); // idle|listening|processing|done
  const [showSheet, setShowSheet] = React.useState(false);
  const [showTextModal, setShowTextModal] = React.useState(false);
  const [transcript, setTranscript] = React.useState('');
  const [response, setResponse] = React.useState('');
  const [textInput, setTextInput] = React.useState('');
  const [orbHidden, setOrbHidden] = React.useState(false);

  const stageRef = React.useRef('idle');
  const transcriptRef = React.useRef('');
  const recognitionRef = React.useRef(null);
  const wasDrag = React.useRef(false);
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  const { width, height } = Dimensions.get('window');
  const orbPos = React.useRef(
    new Animated.ValueXY({ x: width - 80, y: height * 0.62 })
  ).current;

  // Keep stageRef in sync so Speech API callbacks never read stale state
  function setStageSync(s) {
    const val = typeof s === 'function' ? s(stageRef.current) : s;
    stageRef.current = val;
    setStage(val);
  }

  // Pulse animation while listening
  React.useEffect(() => {
    if (stage === 'listening') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,   duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }
  }, [stage]);

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8,
      onPanResponderGrant: () => {
        wasDrag.current = false;
        orbPos.extractOffset();
      },
      onPanResponderMove: (e, g) => {
        wasDrag.current = true;
        Animated.event(
          [null, { dx: orbPos.x, dy: orbPos.y }],
          { useNativeDriver: false }
        )(e, g);
      },
      onPanResponderRelease: (_, g) => {
        orbPos.flattenOffset();
        const moved = Math.abs(g.dx) > 12 || Math.abs(g.dy) > 12;
        if (!moved) {
          handleOrbTap();
          return;
        }
        // Snap orb to nearest screen edge
        const curX = orbPos.x._value;
        Animated.spring(orbPos.x, {
          toValue: curX < width / 2 ? 16 : width - 76,
          useNativeDriver: false,
          tension: 80,
          friction: 10,
        }).start();
      },
    })
  ).current;

  function handleOrbTap() {
    if (stageRef.current === 'idle') {
      startListening();
    } else if (stageRef.current === 'listening') {
      stopListening();
    } else {
      setShowSheet(true);
    }
  }

  function startListening() {
    setStageSync('listening');
    setShowSheet(true);
    transcriptRef.current = '';
    setTranscript('');
    setResponse('');

    const SR =
      typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);

    if (SR) {
      const r = new SR();
      r.continuous = false;
      r.interimResults = false;
      r.lang = 'en-US';
      recognitionRef.current = r;

      // ── SILENCE DETECTION ─────────────────────────────────────────────────
      // onspeechend fires automatically when the browser detects the user
      // stopped speaking — no dBFS polling needed on web.
      r.onspeechend = () => {
        try { r.stop(); } catch (_) {}
      };

      // Hard 6-second fallback in case onspeechend never fires
      const hardTimeout = setTimeout(() => {
        try { r.stop(); } catch (_) {}
      }, 6000);

      r.onresult = (e) => {
        clearTimeout(hardTimeout);
        const text = Array.from(e.results)
          .map((res) => res[0].transcript)
          .join(' ');
        transcriptRef.current = text;
        setTranscript(text);
      };

      r.onend = () => {
        clearTimeout(hardTimeout);
        recognitionRef.current = null;
        processTranscript(transcriptRef.current);
      };

      r.onerror = () => {
        clearTimeout(hardTimeout);
        recognitionRef.current = null;
        setStageSync('idle');
        setShowSheet(false);
      };

      try {
        r.start();
      } catch (_) {
        // Browser blocked mic — fall back to text modal
        setStageSync('idle');
        setShowSheet(false);
        setShowTextModal(true);
      }
    } else {
      // No Speech API (native Expo Go) — use text modal fallback
      setStageSync('idle');
      setShowSheet(false);
      setShowTextModal(true);
    }
  }

  function stopListening() {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      // onend will fire → processTranscript
    } else {
      setStageSync('idle');
      setShowSheet(false);
    }
  }

  async function processTranscript(text) {
    if (!text || !text.trim()) {
      setStageSync('idle');
      setShowSheet(false);
      return;
    }
    setStageSync('processing');

    const AI_PROXY = 'https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/ai-proxy';

    try {
      const res = await fetch(`${AI_PROXY}/anthropic`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          system:
            'You are Rex, a 30-year-old top sales closer and coach. ' +
            'The rep just gave you a voice note after a customer meeting. ' +
            'In 2-3 tight sentences: identify the customer, the deal status, ' +
            'and give one sharp next move. No filler.',
          messages: [{ role: 'user', content: text }],
        }),
      });
      const json = await res.json();
      setResponse(json.content?.[0]?.text ?? '');
    } catch (_) {
      setResponse('Connection error — your note was captured.');
    }
    setStageSync('done');
  }

  function dismiss() {
    setShowSheet(false);
    setStageSync('idle');
    setTranscript('');
    setResponse('');
  }

  // Hide on Rex tab (user is already in Rex chat)
  if (activeTab === 'rex') return null;

  const orbBg =
    stage === 'listening'  ? C.red    :
    stage === 'processing' ? C.orange :
    stage === 'done'       ? C.green  :
    C.gold;

  const orbIcon =
    stage === 'listening'  ? '⏹' :
    stage === 'processing' ? '…' :
    stage === 'done'       ? '✓' :
    '🎙';

  return (
    <>
      {/* ── Restore pill (shown after long-press hides the orb) ── */}
      {orbHidden ? (
        <TouchableOpacity
          style={orbS.restorePill}
          onPress={() => setOrbHidden(false)}
          activeOpacity={0.85}
        >
          <Text style={orbS.restorePillText}>🎙 Show Rex</Text>
        </TouchableOpacity>
      ) : (
        <Animated.View
          style={[
            orbS.wrap,
            {
              transform: [
                ...orbPos.getTranslateTransform(),
                { scale: stage === 'listening' ? pulseAnim : 1 },
              ],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity
            style={[orbS.orb, { backgroundColor: orbBg }]}
            onPress={handleOrbTap}
            onLongPress={() => setOrbHidden(true)}
            delayLongPress={600}
            activeOpacity={0.85}
          >
            <Text style={orbS.orbIcon}>{orbIcon}</Text>
          </TouchableOpacity>
          {stage === 'idle' && (
            <Text style={orbS.label}>Hey Rex</Text>
          )}
        </Animated.View>
      )}

      {/* ── Text-input fallback (native Expo Go / no mic permission) ── */}
      <Modal visible={showTextModal} animationType="fade" transparent>
        <Pressable
          style={orbS.overlay}
          onPress={() => { setShowTextModal(false); setTextInput(''); }}
        >
          <Pressable
            style={[orbS.sheet, { paddingTop: 20 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={orbS.sheetTitle}>🎙 Hey Rex</Text>
            <Text style={orbS.sheetSub}>
              Type your post-meeting notes and Rex will parse them.
            </Text>
            <TextInput
              style={orbS.textInput}
              value={textInput}
              onChangeText={setTextInput}
              placeholder="Name, vehicle interest, follow-up timing…"
              placeholderTextColor={C.grey}
              multiline
              numberOfLines={4}
              autoFocus
            />
            <View style={orbS.actionRow}>
              <TouchableOpacity
                style={orbS.btnSec}
                onPress={() => { setShowTextModal(false); setTextInput(''); }}
              >
                <Text style={orbS.btnSecText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={orbS.btnPri}
                onPress={() => {
                  const text = textInput.trim();
                  if (!text) return;
                  setShowTextModal(false);
                  setTextInput('');
                  setTranscript(text);
                  transcriptRef.current = text;
                  setShowSheet(true);
                  processTranscript(text);
                }}
              >
                <Text style={orbS.btnPriText}>Process →</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Bottom sheet ── */}
      <Modal visible={showSheet} animationType="slide" transparent>
        {/*
          TAP-OUTSIDE behaviour:
          • listening  → stopListening() + collapse sheet
          • done       → dismiss()
          • processing → no-op (let it finish)
        */}
        <Pressable
          style={orbS.overlay}
          onPress={() => {
            if (stageRef.current === 'listening') {
              stopListening();
              setShowSheet(false);
              setStageSync('idle');
            } else if (stageRef.current === 'done') {
              dismiss();
            }
          }}
        >
          <Pressable
            style={orbS.sheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={orbS.handle} />

            {/* Listening */}
            {stage === 'listening' && (
              <View style={orbS.listenBody}>
                <Animated.View
                  style={[orbS.bigOrb, { transform: [{ scale: pulseAnim }] }]}
                >
                  <TouchableOpacity
                    onPress={stopListening}
                    activeOpacity={0.8}
                    style={orbS.bigOrbInner}
                  >
                    <Text style={orbS.bigOrbStop}>⏹</Text>
                    <Text style={orbS.bigOrbHint}>Tap to stop</Text>
                  </TouchableOpacity>
                </Animated.View>
                <Text style={orbS.listenTitle}>Listening…</Text>
                <Text style={orbS.listenSub}>
                  Rex stops automatically when you pause.{'\n'}
                  Tap outside or the orb to stop early.
                </Text>
              </View>
            )}

            {/* Processing */}
            {stage === 'processing' && (
              <View style={orbS.processingBody}>
                <ActivityIndicator color={C.gold} size="large" />
                <Text style={orbS.processingTitle}>Rex is reading your notes…</Text>
                <Text style={orbS.processingLabel}>
                  Parsing customer · building game plan
                </Text>
              </View>
            )}

            {/* Done */}
            {stage === 'done' && (
              <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
                {!!transcript && (
                  <View style={orbS.transcriptBox}>
                    <Text style={orbS.transcriptLabel}>TRANSCRIPT</Text>
                    <Text style={orbS.transcriptText}>{transcript}</Text>
                  </View>
                )}
                {!!response && (
                  <View style={orbS.gamePlanBox}>
                    <Text style={orbS.gamePlanLabel}>🎯 Rex's Take</Text>
                    <Text style={orbS.gamePlanText}>{response}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={orbS.doneBtn}
                  onPress={dismiss}
                  activeOpacity={0.85}
                >
                  <Text style={orbS.doneBtnText}>Done</Text>
                </TouchableOpacity>
                <View style={{ height: 24 }} />
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const orbS = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 999,
    alignItems: 'center',
  },
  orb: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
  },
  orbIcon: { fontSize: 22 },
  label: {
    fontSize: 9,
    fontWeight: '700',
    color: C.gold,
    letterSpacing: 0.5,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  restorePill: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    zIndex: 999,
    backgroundColor: 'rgba(212,168,67,0.15)',
    borderWidth: 1,
    borderColor: C.gold,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  restorePillText: { color: C.gold, fontWeight: '700', fontSize: 12 },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: C.ink2,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: C.ink4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: { color: C.white, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  sheetSub: { color: C.grey2, fontSize: 13, lineHeight: 20, marginBottom: 14 },
  textInput: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.ink4,
    borderRadius: 10,
    padding: 12,
    color: C.white,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  actionRow: { flexDirection: 'row', gap: 10 },
  btnSec: {
    flex: 1,
    backgroundColor: C.ink3,
    borderRadius: 10,
    padding: 13,
    alignItems: 'center',
  },
  btnSecText: { color: C.grey3, fontWeight: '700', fontSize: 14 },
  btnPri: {
    flex: 2,
    backgroundColor: C.gold,
    borderRadius: 10,
    padding: 13,
    alignItems: 'center',
  },
  btnPriText: { color: C.ink, fontWeight: '800', fontSize: 14 },
  listenBody: { alignItems: 'center', gap: 16, paddingBottom: 12 },
  bigOrb: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: C.redBg,
    borderWidth: 2,
    borderColor: C.redBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigOrbInner: { alignItems: 'center', gap: 4 },
  bigOrbStop: { fontSize: 30, color: C.red },
  bigOrbHint: { fontSize: 10, color: C.red, fontWeight: '700' },
  listenTitle: { fontSize: 18, fontWeight: '800', color: C.white, letterSpacing: -0.3 },
  listenSub: { color: C.grey2, fontSize: 13, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  processingBody: { alignItems: 'center', gap: 14, paddingVertical: 28 },
  processingTitle: { fontSize: 16, fontWeight: '700', color: C.white },
  processingLabel: { color: C.grey2, fontSize: 12, textAlign: 'center' },
  transcriptBox: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.ink4,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  transcriptLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: C.grey,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  transcriptText: { color: C.grey3, fontSize: 13, lineHeight: 20 },
  gamePlanBox: {
    backgroundColor: C.ink3,
    borderWidth: 1,
    borderColor: 'rgba(212,168,67,0.2)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  gamePlanLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: C.gold,
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  gamePlanText: { color: C.white, fontSize: 14, lineHeight: 22 },
  doneBtn: {
    backgroundColor: C.gold,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  doneBtnText: { color: C.ink, fontWeight: '800', fontSize: 15 },
});
