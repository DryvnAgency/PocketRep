import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Colors, Fonts } from '../../constants/theme';

interface LessonStep {
  type: 'hook' | 'verse' | 'breakdown' | 'realtalk';
  text?: string;
  ref?: string;
  slang?: string;
  kjv?: string;
}

interface Lesson {
  id: number;
  title: string;
  description: string;
  xp_reward: number;
  content: LessonStep[];
}

interface Quiz {
  id: number;
  questions: {
    question: string;
    options: string[];
    correct_index: number;
    explanation: string;
  }[];
  xp_reward: number;
  pass_threshold: number;
}

export default function LessonDetailScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const router = useRouter();
  const { profile, fetchProfile } = useAuthStore();

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [step, setStep] = useState(0);
  const [showKjv, setShowKjv] = useState(false);
  const [quizMode, setQuizMode] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [quizDone, setQuizDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLesson();
  }, []);

  const fetchLesson = async () => {
    const [lessonRes, quizRes] = await Promise.all([
      supabase.from('lessons').select('*').eq('id', parseInt(lessonId!)).single(),
      supabase.from('quizzes').select('*').eq('lesson_id', parseInt(lessonId!)).single(),
    ]);
    if (lessonRes.data) setLesson(lessonRes.data as any);
    if (quizRes.data) setQuiz(quizRes.data as any);
    setLoading(false);
  };

  const handleQuizAnswer = async (index: number) => {
    if (selected !== null) return;
    setSelected(index);

    const correct = quiz!.questions[currentQ].correct_index === index;
    if (correct) setScore((s) => s + 1);

    // Move to next question after delay
    setTimeout(() => {
      if (currentQ < quiz!.questions.length - 1) {
        setCurrentQ((q) => q + 1);
        setSelected(null);
      } else {
        completeQuiz();
      }
    }, 1500);
  };

  const completeQuiz = async () => {
    setQuizDone(true);
    const finalScore = Math.round(((score + (quiz!.questions[currentQ].correct_index === selected ? 1 : 0)) / quiz!.questions.length) * 100);
    const totalXp = lesson!.xp_reward + (finalScore >= quiz!.pass_threshold ? quiz!.xp_reward : 0);

    if (profile?.id) {
      // Record completion
      await supabase.from('lesson_completions').upsert({
        user_id: profile.id,
        lesson_id: lesson!.id,
        quiz_score: finalScore,
        xp_earned: totalXp,
      });

      // Award XP
      await supabase.rpc('award_xp', { p_user_id: profile.id, p_amount: totalXp });
      await supabase.rpc('update_streak', { p_user_id: profile.id });
      await fetchProfile();
    }
  };

  if (loading || !lesson) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={Colors.gold} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const content = lesson.content;
  const currentStep = content[step];

  // Quiz mode
  if (quizMode && quiz) {
    if (quizDone) {
      const finalScore = Math.round((score / quiz.questions.length) * 100);
      const passed = finalScore >= quiz.pass_threshold;
      return (
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.resultWrap}>
            <Text style={styles.resultEmoji}>{passed ? '🏆' : '📖'}</Text>
            <Text style={styles.resultTitle}>
              {passed ? 'You passed!' : 'Keep studying!'}
            </Text>
            <Text style={styles.resultScore}>{score}/{quiz.questions.length} correct</Text>
            <View style={styles.xpEarned}>
              <Text style={styles.xpEarnedText}>
                +{lesson.xp_reward + (passed ? quiz.xp_reward : 0)} XP earned
              </Text>
            </View>
            <Pressable style={styles.doneBtn} onPress={() => router.back()}>
              <Text style={styles.doneBtnText}>Back to Lessons</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    const q = quiz.questions[currentQ];
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.quizHeader}>
          <Pressable onPress={() => { setQuizMode(false); setCurrentQ(0); setSelected(null); setScore(0); }}>
            <Text style={styles.backBtn}>← Back</Text>
          </Pressable>
          <Text style={styles.quizProgress}>Question {currentQ + 1}/{quiz.questions.length}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.quizContent}>
          <Text style={styles.quizQuestion}>{q.question}</Text>
          <View style={styles.options}>
            {q.options.map((opt, i) => {
              const isSelected = selected === i;
              const isCorrect = i === q.correct_index;
              const showResult = selected !== null;

              return (
                <Pressable
                  key={i}
                  style={[
                    styles.option,
                    showResult && isCorrect && styles.optionCorrect,
                    showResult && isSelected && !isCorrect && styles.optionWrong,
                  ]}
                  onPress={() => handleQuizAnswer(i)}
                  disabled={selected !== null}
                >
                  <View style={styles.optionLetter}>
                    <Text style={styles.optionLetterText}>
                      {String.fromCharCode(65 + i)}
                    </Text>
                  </View>
                  <Text style={styles.optionText}>{opt}</Text>
                  {showResult && isCorrect && <Text style={styles.checkMark}>✓</Text>}
                </Pressable>
              );
            })}
          </View>
          {selected !== null && (
            <View style={styles.explanation}>
              <Text style={styles.explanationText}>{q.explanation}</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Devotional steps
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.devHeader}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Lessons</Text>
        </Pressable>
        <Text style={styles.devTitle}>{lesson.title}</Text>
        <Text style={styles.devXp}>+{lesson.xp_reward} XP</Text>
      </View>

      {/* Step progress */}
      <View style={styles.stepBar}>
        {content.map((_, i) => (
          <View key={i} style={[styles.stepDot, i <= step && styles.stepDotActive]} />
        ))}
        <View style={[styles.stepDot, styles.stepDotQuiz]} />
      </View>

      <ScrollView contentContainerStyle={styles.devContent}>
        {currentStep.type === 'hook' && (
          <View style={styles.hookWrap}>
            <Text style={styles.hookLabel}>🎣 THE HOOK</Text>
            <Text style={styles.hookText}>"{currentStep.text}"</Text>
          </View>
        )}

        {currentStep.type === 'verse' && (
          <View style={styles.verseWrap}>
            <View style={styles.verseHeader}>
              <Text style={styles.verseLabel}>📖 HIS PALABRA</Text>
              <Pressable onPress={() => setShowKjv(!showKjv)}>
                <Text style={styles.verseToggle}>{showKjv ? '🗣️ Slang' : '📜 KJV'}</Text>
              </Pressable>
            </View>
            <Text style={styles.verseText}>
              "{showKjv ? currentStep.kjv : currentStep.slang}"
            </Text>
            <Text style={styles.verseRef}>— {currentStep.ref}</Text>
          </View>
        )}

        {currentStep.type === 'breakdown' && (
          <View style={styles.breakdownWrap}>
            <Text style={styles.breakdownLabel}>💡 THE BREAKDOWN</Text>
            <Text style={styles.breakdownText}>{currentStep.text}</Text>
          </View>
        )}

        {currentStep.type === 'realtalk' && (
          <View style={styles.realtalkWrap}>
            <Text style={styles.realtalkLabel}>🔥 REAL TALK</Text>
            <Text style={styles.realtalkText}>{currentStep.text}</Text>
          </View>
        )}
      </ScrollView>

      {/* Navigation */}
      <View style={styles.navBar}>
        {step > 0 && (
          <Pressable style={styles.navBtnSec} onPress={() => setStep(step - 1)}>
            <Text style={styles.navBtnSecText}>← Back</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        {step < content.length - 1 ? (
          <Pressable style={styles.navBtnPri} onPress={() => setStep(step + 1)}>
            <Text style={styles.navBtnPriText}>Next →</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.navBtnQuiz} onPress={() => setQuizMode(true)}>
            <Text style={styles.navBtnPriText}>Take the Quiz ❓</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  // Devotional header
  devHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.gold },
  devTitle: { fontFamily: Fonts.bodyBold, fontSize: 13, color: Colors.text, flex: 1, textAlign: 'center' },
  devXp: {
    fontFamily: Fonts.bodyBold, fontSize: 11, color: Colors.gold,
    backgroundColor: 'rgba(245,200,66,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },

  stepBar: { flexDirection: 'row', gap: 4, paddingHorizontal: 20, paddingVertical: 12 },
  stepDot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.dim },
  stepDotActive: { backgroundColor: Colors.gold },
  stepDotQuiz: { backgroundColor: Colors.purple },

  devContent: { padding: 20, paddingBottom: 40 },

  // Hook
  hookWrap: {},
  hookLabel: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.orange, letterSpacing: 1.5, marginBottom: 12 },
  hookText: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text, fontStyle: 'italic', lineHeight: 34 },

  // Verse
  verseWrap: {
    backgroundColor: Colors.s1, borderWidth: 1, borderColor: 'rgba(245,200,66,0.2)',
    borderRadius: 14, padding: 18,
  },
  verseHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  verseLabel: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.gold, letterSpacing: 1.5 },
  verseToggle: {
    fontFamily: Fonts.bodySemiBold, fontSize: 11, color: Colors.muted,
    backgroundColor: Colors.s2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5,
  },
  verseText: { fontFamily: Fonts.display, fontSize: 18, color: Colors.text, lineHeight: 30, marginBottom: 10 },
  verseRef: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.gold },

  // Breakdown
  breakdownWrap: {},
  breakdownLabel: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.blue, letterSpacing: 1.5, marginBottom: 12 },
  breakdownText: { fontFamily: Fonts.body, fontSize: 15, color: 'rgba(238,237,248,0.8)', lineHeight: 26 },

  // Real talk
  realtalkWrap: {
    backgroundColor: 'rgba(74,222,128,0.06)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.15)',
    borderRadius: 12, padding: 16,
  },
  realtalkLabel: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.green, letterSpacing: 1.5, marginBottom: 12 },
  realtalkText: { fontFamily: Fonts.bodySemiBold, fontSize: 15, color: Colors.green, lineHeight: 24 },

  // Nav
  navBar: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  navBtnSec: { paddingVertical: 12, paddingHorizontal: 16 },
  navBtnSecText: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.muted },
  navBtnPri: {
    backgroundColor: Colors.gold, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 20,
  },
  navBtnQuiz: {
    backgroundColor: Colors.purple, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 20,
  },
  navBtnPriText: { fontFamily: Fonts.bodyBold, fontSize: 14, color: Colors.bg },

  // Quiz
  quizHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  quizProgress: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.muted },
  quizContent: { padding: 20, paddingBottom: 40 },
  quizQuestion: { fontFamily: Fonts.bodyBold, fontSize: 17, color: Colors.text, lineHeight: 26, marginBottom: 20 },
  options: { gap: 10 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.s1, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, padding: 14,
  },
  optionCorrect: { backgroundColor: 'rgba(74,222,128,0.1)', borderColor: Colors.green },
  optionWrong: { backgroundColor: 'rgba(248,113,113,0.1)', borderColor: Colors.red },
  optionLetter: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: Colors.s3, alignItems: 'center', justifyContent: 'center',
  },
  optionLetterText: { fontFamily: Fonts.bodyBold, fontSize: 12, color: Colors.text },
  optionText: { flex: 1, fontFamily: Fonts.body, fontSize: 14, color: 'rgba(238,237,248,0.8)', lineHeight: 20 },
  checkMark: { fontSize: 16, color: Colors.green, fontWeight: '900' },
  explanation: {
    backgroundColor: Colors.s2, borderRadius: 10, padding: 14, marginTop: 16,
  },
  explanationText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.muted, lineHeight: 20 },

  // Result
  resultWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  resultEmoji: { fontSize: 56, marginBottom: 16 },
  resultTitle: { fontFamily: Fonts.display, fontSize: 28, color: Colors.text, marginBottom: 8 },
  resultScore: { fontFamily: Fonts.bodyBold, fontSize: 18, color: Colors.muted, marginBottom: 20 },
  xpEarned: {
    backgroundColor: 'rgba(245,200,66,0.1)', borderWidth: 1, borderColor: 'rgba(245,200,66,0.2)',
    borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginBottom: 32,
  },
  xpEarnedText: { fontFamily: Fonts.bodyBold, fontSize: 16, color: Colors.gold },
  doneBtn: {
    backgroundColor: Colors.gold, borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 40,
  },
  doneBtnText: { fontFamily: Fonts.bodyBold, fontSize: 16, color: Colors.bg },
});
