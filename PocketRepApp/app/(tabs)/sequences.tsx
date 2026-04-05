import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Dimensions, Alert, ActivityIndicator, Switch, Modal, Linking, Platform,
  AppState, AppStateStatus,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/constants/theme';
import type { Sequence, SequenceStep } from '@/lib/types';
import { INDUSTRY_CONFIG } from '@/lib/industryConfig';
import {
  generateQueue, loadQueueState, saveQueueState, clearQueueState,
  markSentAndLog, type QueueItem,
} from '@/lib/messageQueue';

let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {}

const MASS_TEXT_KEY = 'pocketrep_mass_text_v1';
const { width: screenWidth } = Dimensions.get('window');

const CHANNEL_ICON: Record<string, string> = { text: '💬', call: '📞', email: '📧' };
const INDUSTRIES = ['auto', 'mortgage', 'realestate', 'insurance', 'solar', 'b2b', 'hvac', 'staffing', 'd2d', 'roofing', 'fence', 'prospect', 'other'];
const TEMPLATE_FILTERS = ['all', 'auto', 'mortgage', 'realestate', 'hvac', 'staffing', 'd2d', 'roofing', 'fence', 'insurance', 'solar', 'b2b', 'prospect', 'other'] as const;
type TemplateFilter = typeof TEMPLATE_FILTERS[number];

const TEMPLATES: Sequence[] = [
  // ── AUTO ─────────────────────────────────────────────────────────────────
  {
    id: 'tpl_1',
    name: 'Last Month Sold Customer',
    industry: 'auto',
    description: 'Re-engage customers sold in the past 30 days.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 's1', sequence_id: 'tpl_1', step_number: 1, delay_days: 0, channel: 'text', message_template: 'Hey {{first_name}}, just checking in — how are you loving your new ride?', ai_personalize: false },
      { id: 's2', sequence_id: 'tpl_1', step_number: 2, delay_days: 7, channel: 'text', message_template: 'Hi {{first_name}}! Any questions about your vehicle so far? I\'m here if you need anything.', ai_personalize: false },
      { id: 's3', sequence_id: 'tpl_1', step_number: 3, delay_days: 21, channel: 'call', message_template: '21-day check-in call. Start with the experience — how is the vehicle, any issues, any questions. Once they say they\'re happy, ask: "Do you know anyone in the market? I\'d love to take care of them the way I took care of you."', ai_personalize: false },
      { id: 's4', sequence_id: 'tpl_1', step_number: 4, delay_days: 45, channel: 'text', message_template: 'Hey {{first_name}}, hope everything\'s going great with the vehicle! If you know anyone looking, send them my way — I always take great care of referrals. 🙌', ai_personalize: false },
      { id: 's5', sequence_id: 'tpl_1', step_number: 5, delay_days: 90, channel: 'text', message_template: 'Hey {{first_name}}! Coming up on 90 days — how\'s the {{vehicle}} treating you?', ai_personalize: false },
    ],
  },
  {
    id: 'tpl_4',
    name: 'Sold Customer Retention',
    industry: 'auto',
    description: 'CSI survey prep, referral asks, and annual anniversary. The complete post-delivery sequence.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 't4s1', sequence_id: 'tpl_4', step_number: 1, delay_days: 1, channel: 'text', message_template: 'Hey {{first_name}}, congratulations again on your new {{vehicle}}! Hope the drive home put a huge smile on your face 😊 Reach out anytime if you have questions about any of the features!', ai_personalize: false },
      { id: 't4s2', sequence_id: 'tpl_4', step_number: 2, delay_days: 3, channel: 'text', message_template: 'Hey {{first_name}}, how are you loving the {{vehicle}} so far? I\'d love to set up a quick secondary delivery — 15 minutes to walk you through Bluetooth, remote start, lane assist, all of it. When works for you?', ai_personalize: false },
      { id: 't4s3', sequence_id: 'tpl_4', step_number: 3, delay_days: 5, channel: 'text', message_template: 'Hey {{first_name}}, heads up — you should be getting a short survey from the manufacturer in the next day or two about your experience. If I took great care of you, a top rating means the world to me and helps me keep doing what I do. Any questions before then, I\'m here.', ai_personalize: false },
      { id: 't4s4', sequence_id: 'tpl_4', step_number: 4, delay_days: 10, channel: 'text', message_template: 'Hey {{first_name}}, coming up on about a week with the {{vehicle}} — how\'s everything feeling? First oil change isn\'t until 3,000–5,000 miles but I\'m always here if anything comes up!', ai_personalize: false },
      { id: 't4s5', sequence_id: 'tpl_4', step_number: 5, delay_days: 17, channel: 'call', message_template: 'Two-week check-in call. Ask how they\'re loving it, answer any lingering questions. Warm up the relationship before the referral ask. Don\'t pitch — just be genuinely helpful.', ai_personalize: false },
      { id: 't4s6', sequence_id: 'tpl_4', step_number: 6, delay_days: 30, channel: 'text', message_template: 'Hey {{first_name}}, one month in! 🎉 Hope the {{vehicle}} is treating you exactly how you expected. If anything comes up — service, questions, features — I\'m still your rep. And if you know anyone who\'s looking, send them my way. I take great care of referrals.', ai_personalize: false },
      { id: 't4s7', sequence_id: 'tpl_4', step_number: 7, delay_days: 90, channel: 'text', message_template: 'Hey {{first_name}}, 3 months already — time flies! Hope every drive\'s been a good one. You know anyone looking for a vehicle? I love a good referral and I\'ll make sure they\'re taken care of.', ai_personalize: false },
      { id: 't4s8', sequence_id: 'tpl_4', step_number: 8, delay_days: 180, channel: 'text', message_template: 'Hey {{first_name}}, 6 months in — the {{vehicle}} treating you well? Any service coming up, I can point you in the right direction. Also, when your friends or family are ready for their next vehicle, I hope you think of me first.', ai_personalize: false },
      { id: 't4s9', sequence_id: 'tpl_4', step_number: 9, delay_days: 365, channel: 'text', message_template: 'Happy 1-year anniversary with your {{vehicle}}, {{first_name}}! 🎉 It\'s been a genuine pleasure being your rep. Thank you for trusting me. If you ever need anything — trade-up, second vehicle, or want to send someone my way — I\'m always here.', ai_personalize: false },
    ],
  },
  // ── MORTGAGE ─────────────────────────────────────────────────────────────
  {
    id: 'tpl_2',
    name: 'Rate Drop Alert',
    industry: 'mortgage',
    description: 'Notify leads when rates drop to re-engage fence-sitters.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 's6', sequence_id: 'tpl_2', step_number: 1, delay_days: 0, channel: 'text', message_template: 'Hey {{first_name}}, rates just dropped — this could save you significantly on your monthly payment. Want to run numbers?', ai_personalize: false },
      { id: 's7', sequence_id: 'tpl_2', step_number: 2, delay_days: 2, channel: 'call', message_template: 'Follow-up call to discuss rate drop impact on their specific scenario.', ai_personalize: false },
      { id: 's8', sequence_id: 'tpl_2', step_number: 3, delay_days: 5, channel: 'email', message_template: 'Hi {{first_name}}, sending over a personalized rate comparison for your situation. Let me know if you have questions!', ai_personalize: false },
    ],
  },
  {
    id: 'tpl_5',
    name: 'Closed Loan Follow-Up',
    industry: 'mortgage',
    description: 'Post-closing retention: first payment, refi alerts, referrals, and 1-year check-in.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 't5s1', sequence_id: 'tpl_5', step_number: 1, delay_days: 1, channel: 'text', message_template: 'Hey {{first_name}}, congratulations on closing! 🏡 What a day. Thank you for trusting me with one of the biggest financial moves of your life — honored to have been your loan officer.', ai_personalize: false },
      { id: 't5s2', sequence_id: 'tpl_5', step_number: 2, delay_days: 3, channel: 'text', message_template: 'Hey {{first_name}}, just checking in as you\'re getting settled. Any questions about your first payment, escrow account, or anything about the loan? No question too small — that\'s what I\'m here for.', ai_personalize: false },
      { id: 't5s3', sequence_id: 'tpl_5', step_number: 3, delay_days: 7, channel: 'call', message_template: 'One-week call. Confirm they received closing documents, answer questions, remind them of the NPS survey coming. Make sure they feel completely taken care of.', ai_personalize: false },
      { id: 't5s4', sequence_id: 'tpl_5', step_number: 4, delay_days: 14, channel: 'text', message_template: 'Hey {{first_name}}, hope the new home is feeling more like home every day! Let me know if you need any contractor or service recommendations — I have a great network.', ai_personalize: false },
      { id: 't5s5', sequence_id: 'tpl_5', step_number: 5, delay_days: 30, channel: 'text', message_template: 'Hey {{first_name}}, first full month in the books! Just wanted to check in and make sure everything went smoothly with your first payment. Any issues, I can help connect you with the right people.', ai_personalize: false },
      { id: 't5s6', sequence_id: 'tpl_5', step_number: 6, delay_days: 90, channel: 'text', message_template: 'Hey {{first_name}}, rates have been shifting — if they drop meaningfully I\'ll let you know right away because a refi could save you real money. For now, hoping the home is treating you great!', ai_personalize: false },
      { id: 't5s7', sequence_id: 'tpl_5', step_number: 7, delay_days: 180, channel: 'text', message_template: 'Hey {{first_name}}, 6 months in! Your equity is building and you\'re in a great spot. If rates ever shift in your favor I\'ll be the first to tell you. Do you know anyone looking to buy or refinance? I\'d love to help them the way I helped you — referrals are everything to me.', ai_personalize: false },
      { id: 't5s8', sequence_id: 'tpl_5', step_number: 8, delay_days: 365, channel: 'text', message_template: 'Happy 1-year in your home, {{first_name}}! 🥂 What a journey it\'s been. Thank you for being a client — hope the home has given you everything you hoped for. I\'m always here if you need anything.', ai_personalize: false },
    ],
  },
  // ── REAL ESTATE ──────────────────────────────────────────────────────────
  {
    id: 'tpl_3',
    name: 'Homeowner Equity Check',
    industry: 'realestate',
    description: 'Touch base with homeowners about their equity position.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 's9', sequence_id: 'tpl_3', step_number: 1, delay_days: 0, channel: 'text', message_template: 'Hey {{first_name}}, just thinking of you and wanted to pass along a quick update on your neighborhood. Values in your area have shifted since you bought — if you\'re ever curious what your home is worth today, I\'m happy to pull a number. No agenda, just staying in touch.', ai_personalize: false },
      { id: 's10', sequence_id: 'tpl_3', step_number: 2, delay_days: 3, channel: 'call', message_template: 'Call to discuss current market conditions and equity estimate.', ai_personalize: false },
      { id: 's11', sequence_id: 'tpl_3', step_number: 3, delay_days: 10, channel: 'email', message_template: 'Hi {{first_name}}, I ran a quick market analysis on homes near yours — attached is what I found. Happy to chat!', ai_personalize: false },
      { id: 's12', sequence_id: 'tpl_3', step_number: 4, delay_days: 30, channel: 'text', message_template: 'Hey {{first_name}}, just checking back in. The market\'s still moving — let me know if you want an updated number.', ai_personalize: false },
    ],
  },
  {
    id: 'tpl_6',
    name: 'Closed Sale Follow-Up',
    industry: 'realestate',
    description: 'Keys-to-anniversary sequence: settlement help, market updates, and referral asks.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 't6s1', sequence_id: 'tpl_6', step_number: 1, delay_days: 1, channel: 'text', message_template: 'Hey {{first_name}}, CONGRATULATIONS! 🔑 Keys are yours! Thank you for letting me be your agent — this one meant a lot to me. Go enjoy your new home!', ai_personalize: false },
      { id: 't6s2', sequence_id: 'tpl_6', step_number: 2, delay_days: 3, channel: 'text', message_template: 'Hey {{first_name}}, hope the move is going smoothly! If you need any recommendations — movers, contractors, painters, plumbers — I have a great list of trusted people. Just ask!', ai_personalize: false },
      { id: 't6s3', sequence_id: 'tpl_6', step_number: 3, delay_days: 7, channel: 'call', message_template: 'One-week call. See how they\'re settling in, answer any HOA or utility questions, ask if they know anyone looking to buy or sell. Low pressure, high value.', ai_personalize: false },
      { id: 't6s4', sequence_id: 'tpl_6', step_number: 4, delay_days: 14, channel: 'text', message_template: 'Hey {{first_name}}, hope you\'re getting all settled in! Quick reminder — keep your closing docs and insurance info somewhere accessible. Let me know if you need anything.', ai_personalize: false },
      { id: 't6s5', sequence_id: 'tpl_6', step_number: 5, delay_days: 30, channel: 'text', message_template: 'One month homeowner! 🎉 Hey {{first_name}}, how\'s the neighborhood treating you? If friends or family are ever looking to buy or sell in this market, I\'d be honored to help them.', ai_personalize: false },
      { id: 't6s6', sequence_id: 'tpl_6', step_number: 6, delay_days: 90, channel: 'text', message_template: 'Hey {{first_name}}, market\'s always moving. Your home is already building equity. If you ever want a quick valuation update or know someone ready to make a move, I\'m your person.', ai_personalize: false },
      { id: 't6s7', sequence_id: 'tpl_6', step_number: 7, delay_days: 365, channel: 'text', message_template: 'Happy 1-year in your home, {{first_name}}! 🏡 I still remember the day we got those keys. Thank you for trusting me. If you ever need me — or know someone who does — I\'m always a text away.', ai_personalize: false },
    ],
  },
  // ── HVAC ─────────────────────────────────────────────────────────────────
  {
    id: 'tpl_7',
    name: 'After Service Follow-Up',
    industry: 'hvac',
    description: '30-day satisfaction check, filter reminder, seasonal tune-up, and referral ask.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 't7s1', sequence_id: 'tpl_7', step_number: 1, delay_days: 1, channel: 'text', message_template: 'Hey {{first_name}}, thank you for letting us take care of your system today! Means a lot. Everything running comfortably? Let me know if anything feels off.', ai_personalize: false },
      { id: 't7s2', sequence_id: 'tpl_7', step_number: 2, delay_days: 3, channel: 'text', message_template: 'Hey {{first_name}}, just checking in — is the system running smoothly since the service? Any unusual sounds, temps not right, anything at all — reach out and I\'ll make it right.', ai_personalize: false },
      { id: 't7s3', sequence_id: 'tpl_7', step_number: 3, delay_days: 7, channel: 'text', message_template: 'Hey {{first_name}}, one week out and hoping everything\'s perfect! Quick tip: put a filter change reminder in your phone for 90 days. Small habit, big difference in efficiency.', ai_personalize: false },
      { id: 't7s4', sequence_id: 'tpl_7', step_number: 4, delay_days: 30, channel: 'call', message_template: '30-day quality check call. Ask about comfort level, any issues, and gently mention the seasonal tune-up program. Ask if they know anyone who needs HVAC service.', ai_personalize: false },
      { id: 't7s5', sequence_id: 'tpl_7', step_number: 5, delay_days: 90, channel: 'text', message_template: 'Hey {{first_name}}, 3-month filter reminder! 🔧 Also, if you\'re heading into a hot or cold season, a quick tune-up now prevents emergency calls later. Want me to get you on the schedule?', ai_personalize: false },
      { id: 't7s6', sequence_id: 'tpl_7', step_number: 6, delay_days: 180, channel: 'text', message_template: 'Hey {{first_name}}, 6-month check-in! Hope the system\'s been reliable all season. If you know anyone with HVAC needs — new system, repair, tune-up — send them my way. I\'ll take great care of them.', ai_personalize: false },
    ],
  },
  // ── PROSPECT NURTURE ─────────────────────────────────────────────────────
  {
    id: 'tpl_8',
    name: 'New Prospect Nurture',
    industry: 'prospect',
    description: 'Direct, natural follow-up sequence for new prospects. Edit before sending to add any timing context that fits the moment — end of month, upcoming holiday, current deal. Keep it conversational.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 't8s1', sequence_id: 'tpl_8', step_number: 1, delay_days: 0, channel: 'text', message_template: 'Hey {{first_name}}, great connecting with you! I\'ll do everything on my end to make this easy. Reach out anytime — I\'m here.', ai_personalize: false },
      { id: 't8s2', sequence_id: 'tpl_8', step_number: 2, delay_days: 1, channel: 'text', message_template: 'Hey {{first_name}}, just following up from yesterday. I\'ve been thinking about what you\'re looking for — when can we connect for 10 minutes? I think I can help.', ai_personalize: false },
      { id: 't8s3', sequence_id: 'tpl_8', step_number: 3, delay_days: 2, channel: 'text', message_template: 'Hey {{first_name}}, I\'d hate for you to miss out on something that\'s a real fit for you. What\'s the best time to connect this week?', ai_personalize: false },
      { id: 't8s4', sequence_id: 'tpl_8', step_number: 4, delay_days: 3, channel: 'text', message_template: 'Hey {{first_name}}, keeping it short — I have something specific in mind for your situation. Worth a 10-minute call. When works?', ai_personalize: false },
      { id: 't8s5', sequence_id: 'tpl_8', step_number: 5, delay_days: 5, channel: 'text', message_template: 'Hey {{first_name}}, still thinking about what you told me and I genuinely think we can make something work. What would it take to get you moving this week?', ai_personalize: false },
      { id: 't8s6', sequence_id: 'tpl_8', step_number: 6, delay_days: 7, channel: 'call', message_template: 'One-week follow-up call. Reference exactly what they told you — show you remembered. Lead with a specific idea for their situation, not a generic pitch. Ask what\'s holding them up and listen.', ai_personalize: false },
      { id: 't8s7', sequence_id: 'tpl_8', step_number: 7, delay_days: 10, channel: 'text', message_template: 'Hey {{first_name}}, still here. I know the timing hasn\'t clicked yet — just want you to know I\'m your person when it does.', ai_personalize: false },
      { id: 't8s8', sequence_id: 'tpl_8', step_number: 8, delay_days: 14, channel: 'text', message_template: 'Hey {{first_name}}, last one for a while — I don\'t want to be in your inbox if the timing isn\'t right. When you\'re ready, reach out. I\'ll make it worth it. 🤝', ai_personalize: false },
    ],
  },
  // ── STAFFING ─────────────────────────────────────────────────────────────
  {
    id: 'tpl_9',
    name: 'Post-Placement Follow-Up',
    industry: 'staffing',
    description: 'Keep candidates and clients happy through the first 6 months. Drives retention, referrals, and repeat placements.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 't9s1', sequence_id: 'tpl_9', step_number: 1, delay_days: 1, channel: 'text', message_template: 'Hey {{first_name}}, congrats on the new role — hope day one was everything you expected! I\'m here if you have any questions getting settled. Reach out anytime.', ai_personalize: false },
      { id: 't9s2', sequence_id: 'tpl_9', step_number: 2, delay_days: 3, channel: 'call', message_template: 'Quick check-in call with the hiring manager. Ask: How is the new placement settling in? Any gaps or surprises? Make sure both sides are happy early.', ai_personalize: false },
      { id: 't9s3', sequence_id: 'tpl_9', step_number: 3, delay_days: 7, channel: 'text', message_template: 'Hey {{first_name}}, one week in! How are you feeling about the role? Team good? Anything I can help clarify or smooth out on my end?', ai_personalize: false },
      { id: 't9s4', sequence_id: 'tpl_9', step_number: 4, delay_days: 14, channel: 'text', message_template: 'Hey {{first_name}}, two weeks in — hope you\'re getting into your groove! If anything feels off about the fit, better to surface it now than later. I\'m in your corner.', ai_personalize: false },
      { id: 't9s5', sequence_id: 'tpl_9', step_number: 5, delay_days: 30, channel: 'call', message_template: '30-day satisfaction call. One goal: make sure they\'re happy. Ask how the role is matching expectations, if there\'s anything that\'s felt off, if the team has been what they expected. Nothing else — just confirm the placement is working for both sides.', ai_personalize: false },
      { id: 't9s6', sequence_id: 'tpl_9', step_number: 6, delay_days: 90, channel: 'text', message_template: 'Hey {{first_name}}, 3 months in — you\'re officially past the honeymoon phase! Hope the role is delivering for you. If you know anyone in your network looking for their next move, I\'d love the intro.', ai_personalize: false },
      { id: 't9s7', sequence_id: 'tpl_9', step_number: 7, delay_days: 180, channel: 'text', message_template: 'Hey {{first_name}}, 6 months already! How are things going? If you\'re thinking about the next chapter — more money, better title, different culture — let\'s talk before you even start browsing. I find better fits faster.', ai_personalize: false },
    ],
  },
  // ── DOOR-TO-DOOR ─────────────────────────────────────────────────────────
  {
    id: 'tpl_10',
    name: 'Post-Knock Follow-Up',
    industry: 'd2d',
    description: 'Keep the conversation alive after the door. Most D2D closes happen on the 2nd or 3rd contact.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 't10s1', sequence_id: 'tpl_10', step_number: 1, delay_days: 0, channel: 'text', message_template: 'Hey {{first_name}}, great meeting you today! I\'m [rep] — I stopped by to share something that could genuinely save you money. No pressure. Just reach out when you want that conversation.', ai_personalize: false },
      { id: 't10s2', sequence_id: 'tpl_10', step_number: 2, delay_days: 2, channel: 'text', message_template: 'Hey {{first_name}}, quick follow-up from Tuesday. I know you were in the middle of your day when I stopped by — totally fine. The offer I mentioned is still on the table. 5 minutes on a call could put money back in your pocket.', ai_personalize: false },
      { id: 't10s3', sequence_id: 'tpl_10', step_number: 3, delay_days: 5, channel: 'text', message_template: 'Hey {{first_name}}, I\'d hate for you to miss a good window on this. Pricing and availability look good right now — happy to get you taken care of quickly if you want to connect today.', ai_personalize: false },
      { id: 't10s4', sequence_id: 'tpl_10', step_number: 4, delay_days: 10, channel: 'call', message_template: 'Final follow-up call. Keep it short — "Hey {{first_name}}, just checking if there\'s anything I can answer for you before I close out this area." If no, thank them and move on gracefully.', ai_personalize: false },
      { id: 't10s5', sequence_id: 'tpl_10', step_number: 5, delay_days: 21, channel: 'text', message_template: 'Hey {{first_name}}, been a few weeks — still think this is a good fit for you. Want to get it sorted out before things shift? Happy to make it quick.', ai_personalize: false },
    ],
  },
  // ── ROOFING ──────────────────────────────────────────────────────────────
  {
    id: 'tpl_11',
    name: 'Post-Estimate Follow-Up',
    industry: 'roofing',
    description: 'Keep the lead warm after the inspection and estimate. Most roofing closes need 2-3 follow-ups.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 't11s1', sequence_id: 'tpl_11', step_number: 1, delay_days: 1, channel: 'text', message_template: 'Hey {{first_name}}, great meeting you for the inspection! Your estimate should be in your inbox now. Happy to walk through it on a quick call if anything looks unclear. What questions do you have?', ai_personalize: false },
      { id: 't11s2', sequence_id: 'tpl_11', step_number: 2, delay_days: 3, channel: 'text', message_template: 'Hey {{first_name}}, just following up on the estimate. One thing worth knowing — if you have any storm damage from last year\'s season, your insurance may cover a significant portion of the cost. I can walk you through the claims process. It\'s easier than most people think.', ai_personalize: false },
      { id: 't11s3', sequence_id: 'tpl_11', step_number: 3, delay_days: 7, channel: 'call', message_template: 'One-week follow-up call. Ask: Did they review the estimate? Any concerns? If insurance is in play, ask if they\'ve contacted their adjuster yet. Offer to be on the call with them.', ai_personalize: false },
      { id: 't11s4', sequence_id: 'tpl_11', step_number: 4, delay_days: 14, channel: 'text', message_template: 'Hey {{first_name}}, just checking in — storm season is ramping up and our schedule fills fast once the rush starts. If you want to lock in a slot before the backlog hits, this week is the time. Want me to pencil you in?', ai_personalize: false },
      { id: 't11s5', sequence_id: 'tpl_11', step_number: 5, delay_days: 30, channel: 'text', message_template: 'Hey {{first_name}}, I know it\'s been a few weeks. If you went with another company, I genuinely hope the job went well. If you\'re still deciding or the other quote fell through, I\'m still here and the estimate stands. Just let me know.', ai_personalize: false },
    ],
  },
  {
    id: 'tpl_12',
    name: 'Post-Install Retention',
    industry: 'roofing',
    description: 'Post-install sequence to drive referrals, reviews, and repeat business for maintenance.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 't12s1', sequence_id: 'tpl_12', step_number: 1, delay_days: 1, channel: 'text', message_template: 'Hey {{first_name}}, job\'s done! Hope everything looks great from the curb. We clean up after ourselves, but do a quick walk around — if anything looks off, send me a photo and I\'ll take care of it. Thank you for the business!', ai_personalize: false },
      { id: 't12s2', sequence_id: 'tpl_12', step_number: 2, delay_days: 7, channel: 'text', message_template: 'Hey {{first_name}}, one week post-install check-in. Everything holding up? Any concerns? Also — if the experience was great, a quick Google review goes a long way for a small business like ours. No pressure, just means a lot.', ai_personalize: false },
      { id: 't12s3', sequence_id: 'tpl_12', step_number: 3, delay_days: 30, channel: 'text', message_template: 'Hey {{first_name}}, one month in on the new roof! Hope it\'s given you peace of mind already. Quick reminder — your warranty docs were emailed to you. Keep them somewhere safe. And if you know any neighbors who\'ve been putting off their roof, I\'d love the intro.', ai_personalize: false },
      { id: 't12s4', sequence_id: 'tpl_12', step_number: 4, delay_days: 90, channel: 'text', message_template: 'Hey {{first_name}}, just checking in as the seasons change. Roofs can take a beating during the transition — gutters, flashing, and vents are the usual suspects. If you want a quick seasonal inspection (on us), just say the word.', ai_personalize: false },
      { id: 't12s5', sequence_id: 'tpl_12', step_number: 5, delay_days: 365, channel: 'text', message_template: 'Hey {{first_name}}, one year on your new roof! 🏠 Hope it\'s been leak-free and worry-free. Annual inspection keeps the warranty valid — want me to schedule a quick one? And as always, any referrals are the biggest compliment you can give me.', ai_personalize: false },
    ],
  },
  // ── INSURANCE ────────────────────────────────────────────────────────────
  {
    id: 'tpl_13',
    name: 'New Policy Welcome',
    industry: 'insurance',
    description: 'Post-close retention sequence: onboard the client, prep for renewal, drive referrals.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 't13s1', sequence_id: 'tpl_13', step_number: 1, delay_days: 1, channel: 'text', message_template: 'Hey {{first_name}}, welcome to the policy! Your documents should be in your inbox. Take a look when you get a chance — key info: your policy number, deductible, and claims contact. Any questions, I\'m your person.', ai_personalize: false },
      { id: 't13s2', sequence_id: 'tpl_13', step_number: 2, delay_days: 3, channel: 'text', message_template: 'Hey {{first_name}}, one thing most people don\'t know — you should review your policy whenever there\'s a major life change: new car, new home, new baby, major income shift. I\'ll remind you at renewal, but feel free to flag anything sooner.', ai_personalize: false },
      { id: 't13s3', sequence_id: 'tpl_13', step_number: 3, delay_days: 30, channel: 'call', message_template: '30-day satisfaction call. Ask: Has there been any confusion about the policy? Any changes in their situation? Check if there are gaps (home, auto, life, umbrella) and mention a quick coverage review.', ai_personalize: false },
      { id: 't13s4', sequence_id: 'tpl_13', step_number: 4, delay_days: 180, channel: 'text', message_template: 'Hey {{first_name}}, 6-month check-in! Quick question — has anything changed in the last 6 months that might affect your coverage? New vehicle, renovation, anyone new in the household? Let\'s make sure you\'re fully protected.', ai_personalize: false },
      { id: 't13s5', sequence_id: 'tpl_13', step_number: 5, delay_days: 335, channel: 'text', message_template: 'Hey {{first_name}}, your renewal is coming up in about 30 days. I\'m reviewing your policy now and will have any changes or savings opportunities for you before then. Also — if you know friends or family who could use a second opinion on their coverage, I\'d love to help them.', ai_personalize: false },
    ],
  },
  // ── SOLAR ─────────────────────────────────────────────────────────────────
  {
    id: 'tpl_14',
    name: 'Post-Proposal Follow-Up',
    industry: 'solar',
    description: 'Keep the proposal alive through the typical 2-4 week solar decision cycle.',
    user_id: null, is_template: true, is_custom: false, created_at: '',
    sequence_steps: [
      { id: 't14s1', sequence_id: 'tpl_14', step_number: 1, delay_days: 1, channel: 'text', message_template: 'Hey {{first_name}}, great meeting today! Your proposal should be in your inbox — it shows your current usage vs. what solar covers, the 30% federal tax credit, and the 25-year savings projection. Walk through it and let me know your questions.', ai_personalize: false },
      { id: 't14s2', sequence_id: 'tpl_14', step_number: 2, delay_days: 3, channel: 'text', message_template: 'Hey {{first_name}}, the most common question I get: "What if I move?" Solar adds $15K–$25K in home value on average and homes with solar sell faster. Buyers pay a premium for locked-in energy costs. Just wanted to address that before you ask!', ai_personalize: false },
      { id: 't14s3', sequence_id: 'tpl_14', step_number: 3, delay_days: 7, channel: 'call', message_template: 'One-week follow-up call. Ask: Did they review the proposal? Do they have questions about financing, the tax credit, or the installation process? If they\'re comparing quotes, ask what the other company offered — you can usually match or beat it.', ai_personalize: false },
      { id: 't14s4', sequence_id: 'tpl_14', step_number: 4, delay_days: 14, channel: 'text', message_template: 'Hey {{first_name}}, utility rates just went up again — did you see the news? Every month you wait is another month of paying the utility company instead of locking in your rate. I can still honor the proposal numbers we put together. Want to move forward?', ai_personalize: false },
      { id: 't14s5', sequence_id: 'tpl_14', step_number: 5, delay_days: 30, channel: 'text', message_template: 'Hey {{first_name}}, last follow-up — I don\'t want to be in your inbox if the timing isn\'t right. If you\'re still interested, the 30% federal tax credit is available now and I can still lock in your current roof conditions for installation. Just let me know either way.', ai_personalize: false },
    ],
  },
];

type ScreenView = 'list' | 'detail' | 'create';

interface MassTextRecord {
  id: string;
  message: string;
  recipient_count: number;
  sent_at: string;
}

const EMPTY_STEP = (): Omit<SequenceStep, 'id' | 'sequence_id'> => ({
  step_number: 1,
  delay_days: 0,
  channel: 'text',
  message_template: '',
  ai_personalize: false,
});

export default function SequencesScreen() {
  const [view, setView] = useState<ScreenView>('list');
  const [openSection, setOpenSection] = useState<number | null>(0);

  const [mySequences, setMySequences] = useState<Sequence[]>([]);
  const [massTexts, setMassTexts] = useState<MassTextRecord[]>([]);
  const [loadingMy, setLoadingMy] = useState(false);

  const [selectedSeq, setSelectedSeq] = useState<Sequence | null>(null);

  // Builder state
  const [bName, setBName] = useState('');
  const [bDesc, setBDesc] = useState('');
  const [bIndustry, setBIndustry] = useState('auto');
  const [bSteps, setBSteps] = useState<Array<Omit<SequenceStep, 'id' | 'sequence_id'> & { localId: string }>>([
    { ...EMPTY_STEP(), localId: '1' },
  ]);
  const [saving, setSaving] = useState(false);
  const [userPlan, setUserPlan] = useState<string>('pro');
  const [userId, setUserId] = useState<string | null>(null);
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>('all');
  // Message queue
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [queuePos, setQueuePos] = useState(0);
  const [editingMessage, setEditingMessage] = useState<string | null>(null);
  const pendingSendRef = useRef<QueueItem | null>(null);
  const [showConfirmSent, setShowConfirmSent] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  // History
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showMassTextModal, setShowMassTextModal] = useState(false);
  const [massMsg, setMassMsg] = useState('');
  const [allContacts, setAllContacts] = useState<{id: string; first_name: string; last_name: string; phone: string}[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [contactSearch, setContactSearch] = useState('');

  // Plan limits: Pro=50, Elite=100
  const MASS_LIMIT = userPlan === 'elite' ? 100 : 50;

  useFocusEffect(useCallback(() => {
    loadMySequences();
    loadMassTexts();
    loadQueue();
  }, []));

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      const nowActive = nextState === 'active';
      if (wasBackground && nowActive && pendingSendRef.current) {
        setShowConfirmSent(true);
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, []);

  async function loadHistory(uid: string) {
    setHistoryLoading(true);
    try {
      const { data } = await supabase
        .from('contact_interactions')
        .select('*')
        .eq('user_id', uid)
        .order('sent_at', { ascending: false })
        .limit(200);
      setHistoryItems(data ?? []);
      setHistoryLoaded(true);
    } catch {
      setHistoryItems([]);
    }
    setHistoryLoading(false);
  }

  async function loadMySequences() {
    setLoadingMy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingMy(false); return; }
      setUserId(user.id);

      const [{ data: prof }, { data: seqs }, { data: ctcts }] = await Promise.all([
        supabase.from('profiles').select('plan,industry').eq('id', user.id).single(),
        supabase.from('sequences').select('*, sequence_steps(*)').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('contacts').select('id,first_name,last_name,phone').eq('user_id', user.id).order('last_name'),
      ]);
      if (prof) {
        setUserPlan(prof.plan ?? 'pro');
        const ind = prof.industry as TemplateFilter;
        if (ind && (TEMPLATE_FILTERS as readonly string[]).includes(ind)) {
          setTemplateFilter(ind);
        }
      }
      setMySequences(seqs ?? []);
      setAllContacts((ctcts ?? []) as any);
    } catch {
      setMySequences([]);
    }
    setLoadingMy(false);
  }

  async function loadQueue() {
    setQueueLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setQueueLoading(false); return; }
      // Check for a saved queue first; if fresh, generate
      const saved = await loadQueueState();
      const today = new Date().toISOString().split('T')[0];
      if (saved && saved.generated_at.startsWith(today)) {
        const pending = saved.items.filter(i => i.status === 'pending' || i.status === 'saved');
        setQueueItems(pending);
        setQueuePos(saved.saved_position);
      } else {
        const { data: prof } = await supabase.from('profiles').select('plan').eq('id', user.id).single();
        const items = await generateQueue(user.id, prof?.plan ?? 'pro');
        setQueueItems(items);
        setQueuePos(0);
        if (items.length > 0) {
          await saveQueueState({ generated_at: new Date().toISOString(), items, saved_position: 0 });
        }
      }
    } catch { setQueueItems([]); }
    setQueueLoading(false);
  }

  async function handleSendItem(item: QueueItem) {
    pendingSendRef.current = item;
    if (item.channel === 'text' && item.phone) {
      const url = `sms:${item.phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(editingMessage ?? item.message)}`;
      await Linking.openURL(url).catch(() => {});
      // AppState listener fires when rep returns to app → shows "Did you send it?" banner
    } else {
      // Call/email: confirm immediately (no SMS app transition)
      await confirmSent(item);
    }
  }

  async function confirmSent(item: QueueItem) {
    pendingSendRef.current = null;
    setShowConfirmSent(false);
    if (userId) await markSentAndLog(item, userId);
    const next = queuePos + 1;
    const updatedItems = queueItems.map((q, i) =>
      i === queuePos ? { ...q, status: 'sent' as const } : q
    );
    setQueueItems(updatedItems);
    setEditingMessage(null);
    if (next >= updatedItems.length) {
      await clearQueueState();
      setShowQueueModal(false);
      Alert.alert('All done! 🎉', `Sent ${updatedItems.filter(i => i.status === 'sent').length} messages today.`);
    } else {
      setQueuePos(next);
      await saveQueueState({ generated_at: new Date().toISOString(), items: updatedItems, saved_position: next });
    }
  }

  async function handleSkipItem() {
    const updatedItems = queueItems.map((q, i) =>
      i === queuePos ? { ...q, status: 'skipped' as const } : q
    );
    const next = queuePos + 1;
    setQueueItems(updatedItems);
    setEditingMessage(null);
    if (next >= updatedItems.length) {
      await saveQueueState({ generated_at: new Date().toISOString(), items: updatedItems, saved_position: next });
      setShowQueueModal(false);
    } else {
      setQueuePos(next);
      await saveQueueState({ generated_at: new Date().toISOString(), items: updatedItems, saved_position: next });
    }
  }

  async function handleSaveAndExit() {
    pendingSendRef.current = null;
    setShowConfirmSent(false);
    await saveQueueState({ generated_at: new Date().toISOString(), items: queueItems, saved_position: queuePos });
    setShowQueueModal(false);
  }

  function openMassText() {
    setMassMsg('');
    setSelectedContactIds(new Set());
    setContactSearch('');
    setShowMassTextModal(true);
  }

  function toggleContact(id: string) {
    setSelectedContactIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MASS_LIMIT) {
        next.add(id);
      } else {
        Alert.alert(`Limit reached`, `Your ${userPlan === 'elite' ? 'Elite' : 'Pro'} plan allows up to ${MASS_LIMIT} recipients.`);
      }
      return next;
    });
  }

  async function sendMassText() {
    if (!massMsg.trim() || selectedContactIds.size === 0) return;
    const count = selectedContactIds.size;

    Alert.alert('Send Mass Text', `Send to ${count} contact${count !== 1 ? 's' : ''}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send',
        onPress: async () => {
          // Save record to AsyncStorage
          if (AsyncStorage) {
            const record: MassTextRecord = {
              id: Date.now().toString(),
              message: massMsg,
              recipient_count: count,
              sent_at: new Date().toISOString(),
            };
            const existing = massTexts;
            const updated = [...existing, record];
            await AsyncStorage.setItem(MASS_TEXT_KEY, JSON.stringify(updated));
            setMassTexts(updated);
          }
          setShowMassTextModal(false);
          Alert.alert('Queued!', `${count} messages queued for delivery.`);
        },
      },
    ]);
  }

  async function loadMassTexts() {
    if (!AsyncStorage) return;
    try {
      const raw = await AsyncStorage.getItem(MASS_TEXT_KEY);
      if (raw) setMassTexts(JSON.parse(raw));
    } catch {}
  }

  function toggleSection(idx: number) {
    setOpenSection(prev => (prev === idx ? null : idx));
  }

  function openDetail(seq: Sequence) {
    setSelectedSeq(seq);
    setView('detail');
  }

  function openCreate() {
    // All paid plans (Pro and Elite) can create custom sequences
    setBName('');
    setBDesc('');
    setBIndustry('auto');
    setBSteps([{ ...EMPTY_STEP(), localId: Date.now().toString() }]);
    setView('create');
  }

  function addStep() {
    setBSteps(prev => [
      ...prev,
      { ...EMPTY_STEP(), step_number: prev.length + 1, localId: Date.now().toString() },
    ]);
  }

  function removeStep(localId: string) {
    setBSteps(prev => prev.filter(s => s.localId !== localId).map((s, i) => ({ ...s, step_number: i + 1 })));
  }

  function updateStep(localId: string, patch: Partial<Omit<SequenceStep, 'id' | 'sequence_id'>>) {
    setBSteps(prev => prev.map(s => s.localId === localId ? { ...s, ...patch } : s));
  }

  async function saveSequence() {
    if (!bName.trim()) { Alert.alert('Name is required'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSaving(false); return; }

      const { data: seq, error } = await supabase.from('sequences').insert({
        name: bName.trim(),
        description: bDesc.trim() || null,
        industry: bIndustry,
        user_id: user.id,
        is_template: false,
        is_custom: true,
      }).select().single();

      if (error || !seq) throw new Error('Failed to save sequence');

      const steps = bSteps.map(s => ({
        sequence_id: seq.id,
        step_number: s.step_number,
        delay_days: s.delay_days,
        channel: s.channel,
        message_template: s.message_template,
        ai_personalize: s.ai_personalize,
      }));
      await supabase.from('sequence_steps').insert(steps);

      await loadMySequences();
      setView('list');
    } catch {
      Alert.alert('Saved locally', 'Could not reach the server. Your sequence was not saved.');
    }
    setSaving(false);
  }

  if (view === 'detail' && selectedSeq) {
    return <DetailView seq={selectedSeq} onBack={() => setView('list')} />;
  }

  if (view === 'create') {
    return (
      <View style={s.root}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setView('list')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.backArrow}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>New Sequence</Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
          <Text style={s.fieldLabel}>Name</Text>
          <TextInput
            style={s.fieldInput}
            value={bName}
            onChangeText={setBName}
            placeholder="e.g. 90-Day Follow-Up"
            placeholderTextColor={colors.grey}
          />

          <Text style={s.fieldLabel}>Description</Text>
          <TextInput
            style={[s.fieldInput, { height: 60, textAlignVertical: 'top' }]}
            value={bDesc}
            onChangeText={setBDesc}
            placeholder="What is this sequence for?"
            placeholderTextColor={colors.grey}
            multiline
          />

          <Text style={s.fieldLabel}>Industry</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {INDUSTRIES.map(ind => (
                <TouchableOpacity
                  key={ind}
                  style={[s.industryPill, bIndustry === ind && s.industryPillActive]}
                  onPress={() => setBIndustry(ind)}
                >
                  <Text style={[s.industryPillText, bIndustry === ind && s.industryPillTextActive]}>
                    {ind}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={[s.fieldLabel, { marginBottom: spacing.sm }]}>Steps</Text>
          {bSteps.map((step, idx) => (
            <View key={step.localId} style={s.stepCard}>
              <View style={s.stepCardHeader}>
                <Text style={s.stepNum}>Step {idx + 1}</Text>
                {bSteps.length > 1 && (
                  <TouchableOpacity onPress={() => removeStep(step.localId)}>
                    <Text style={s.removeStep}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={s.stepFieldLabel}>Channel</Text>
              <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm }}>
                {(['text', 'call', 'email'] as const).map(ch => (
                  <TouchableOpacity
                    key={ch}
                    style={[s.channelPill, step.channel === ch && s.channelPillActive]}
                    onPress={() => updateStep(step.localId, { channel: ch })}
                  >
                    <Text style={[s.channelPillText, step.channel === ch && s.channelPillTextActive]}>
                      {CHANNEL_ICON[ch]} {ch}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.stepFieldLabel}>Send on Day</Text>
              <TextInput
                style={s.stepInput}
                value={step.delay_days.toString()}
                onChangeText={v => updateStep(step.localId, { delay_days: parseInt(v) || 0 })}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.grey}
              />

              <Text style={s.stepFieldLabel}>Message Template</Text>
              <TextInput
                style={[s.stepInput, { height: 70, textAlignVertical: 'top' }]}
                value={step.message_template}
                onChangeText={v => updateStep(step.localId, { message_template: v })}
                placeholder="Use {{first_name}} for personalization"
                placeholderTextColor={colors.grey}
                multiline
              />

              <View style={s.aiRow}>
                <Text style={s.stepFieldLabel}>AI Personalize</Text>
                <Switch
                  value={step.ai_personalize}
                  onValueChange={v => updateStep(step.localId, { ai_personalize: v })}
                  trackColor={{ false: colors.ink4, true: colors.gold }}
                  thumbColor={step.ai_personalize ? colors.ink : colors.grey2}
                />
              </View>
            </View>
          ))}

          <TouchableOpacity style={s.addStepBtn} onPress={addStep}>
            <Text style={s.addStepBtnText}>+ Add Step</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.saveBtn} onPress={saveSequence} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={s.saveBtnText}>Save Sequence</Text>}
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View style={s.logoMark}>
          <Text style={s.logoMarkText}>P</Text>
        </View>
        <Text style={s.headerTitle}>Sequences</Text>
        <TouchableOpacity style={s.massTextBtn} onPress={openMassText} activeOpacity={0.8}>
          <Text style={s.massTextBtnText}>📤 Mass Text</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Section: Ready to Send */}
        <AccordionSection
          title={`📤 Ready to Send${queueItems.length > 0 ? `  •  ${queueItems.length}` : ''}`}
          open={openSection === 3}
          onToggle={() => toggleSection(3)}
        >
          {queueLoading ? (
            <ActivityIndicator color={colors.gold} style={{ margin: spacing.lg }} />
          ) : queueItems.length === 0 ? (
            <View style={s.emptySection}>
              <Text style={s.emptySectionText}>You're all caught up ✅</Text>
            </View>
          ) : (
            <View style={sq.card}>
              <View style={sq.cardTop}>
                <Text style={sq.cardCount}>{queueItems.length} message{queueItems.length !== 1 ? 's' : ''} ready</Text>
                <Text style={sq.cardSub}>Oldest due: {queueItems[0]?.due_date} · Est. {Math.ceil(queueItems.length * 0.5)} min</Text>
              </View>
              {userPlan === 'pro' && queueItems.length === 50 && (
                <Text style={sq.limitNote}>Showing 50 (Pro limit) · Upgrade to Elite for 100/batch</Text>
              )}
              <View style={sq.cardBtns}>
                <TouchableOpacity style={sq.startBtn} onPress={() => { setQueuePos(0); setShowQueueModal(true); }} activeOpacity={0.85}>
                  <Text style={sq.startBtnText}>▶ Start Sending</Text>
                </TouchableOpacity>
                <TouchableOpacity style={sq.saveBtn} onPress={handleSaveAndExit} activeOpacity={0.8}>
                  <Text style={sq.saveBtnText}>💾 Save for Later</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </AccordionSection>

        {/* Section: Templates */}
        <AccordionSection
          title="📋 Templates"
          open={openSection === 0}
          onToggle={() => toggleSection(0)}
        >
          {/* Industry filter pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
            {TEMPLATE_FILTERS.map(f => (
              <TouchableOpacity
                key={f}
                style={[s.filterPill, templateFilter === f && s.filterPillActive]}
                onPress={() => setTemplateFilter(f)}
                activeOpacity={0.8}
              >
                <Text style={[s.filterPillText, templateFilter === f && s.filterPillTextActive]}>
                  {f === 'all' ? '⭐ All' : f === 'prospect' ? '🎯 Prospects' : INDUSTRY_CONFIG[f] ? `${INDUSTRY_CONFIG[f].icon} ${INDUSTRY_CONFIG[f].label}` : f}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.bubbleScroll}>
            {TEMPLATES.filter(t => templateFilter === 'all' || t.industry === templateFilter).map(seq => (
              <SequenceBubble key={seq.id} seq={seq} onPress={() => openDetail(seq)} />
            ))}
          </ScrollView>
        </AccordionSection>

        {/* Section: My Sequences */}
        <AccordionSection
          title="⚡ My Sequences"
          open={openSection === 1}
          onToggle={() => toggleSection(1)}
        >
          {loadingMy ? (
            <ActivityIndicator color={colors.gold} style={{ margin: spacing.lg }} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.bubbleScroll}>
              {mySequences.map(seq => (
                <SequenceBubble key={seq.id} seq={seq} onPress={() => openDetail(seq)} />
              ))}
              <TouchableOpacity style={s.newBubble} onPress={openCreate} activeOpacity={0.8}>
                <Text style={s.newBubbleIcon}>+</Text>
                <Text style={s.newBubbleText}>New Sequence</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </AccordionSection>

        {/* Section: History (Done Log) */}
        <AccordionSection
          title="📜 History"
          open={openSection === 4}
          onToggle={() => {
            toggleSection(4);
            if (openSection !== 4 && userId && !historyLoaded) loadHistory(userId);
          }}
        >
          {historyLoading ? (
            <ActivityIndicator color={colors.gold} style={{ margin: spacing.lg }} />
          ) : historyItems.length === 0 ? (
            <View style={s.emptySection}>
              <Text style={s.emptySectionText}>No sent messages yet. Start sending from your queue!</Text>
            </View>
          ) : (() => {
            // Group by date
            const groups: Record<string, any[]> = {};
            for (const item of historyItems) {
              const day = (item.sent_at ?? '').split('T')[0];
              if (!groups[day]) groups[day] = [];
              groups[day].push(item);
            }
            return (
              <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
                {Object.entries(groups).map(([day, items]) => (
                  <View key={day}>
                    <Text style={s.historyDateHeader}>{day}</Text>
                    {items.map((h: any) => (
                      <View key={h.id} style={s.historyRow}>
                        <Text style={s.historyChannel}>{CHANNEL_ICON[h.channel] ?? '📨'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={s.historyContact} numberOfLines={1}>{h.contact_name ?? 'Unknown'}</Text>
                          <Text style={s.historyMsg} numberOfLines={2}>{(h.message ?? '').slice(0, 80)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            );
          })()}
        </AccordionSection>

        {/* Section: Recent Mass Texts */}
        <AccordionSection
          title="📱 Recent Mass Texts"
          open={openSection === 2}
          onToggle={() => toggleSection(2)}
        >
          {massTexts.length === 0 ? (
            <View style={s.emptySection}>
              <Text style={s.emptySectionText}>No mass texts yet</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.bubbleScroll}>
              {massTexts.slice().reverse().map(mt => (
                <View key={mt.id} style={s.massBubble}>
                  <Text style={s.massBubbleDate}>{new Date(mt.sent_at).toLocaleDateString()}</Text>
                  <Text style={s.massBubbleCount}>{mt.recipient_count} recipients</Text>
                  <Text style={s.massBubbleMsg} numberOfLines={3}>{mt.message}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </AccordionSection>
      </ScrollView>

      {/* Send Queue Modal */}
      <Modal visible={showQueueModal} animationType="slide">
        <View style={sq.modal}>
          {/* Header */}
          <View style={sq.modalHeader}>
            <TouchableOpacity onPress={handleSaveAndExit} activeOpacity={0.8}>
              <Text style={sq.exitBtn}>← Save & Exit</Text>
            </TouchableOpacity>
            <Text style={sq.posLabel}>{queuePos + 1} of {queueItems.length}</Text>
          </View>
          {/* Progress bar */}
          <View style={sq.progressTrack}>
            <View style={[sq.progressFill, { width: `${((queuePos + 1) / Math.max(queueItems.length, 1)) * 100}%` as any }]} />
          </View>

          {/* "Did you send it?" confirmation banner */}
          {showConfirmSent && pendingSendRef.current && (
            <View style={sq.confirmBanner}>
              <Text style={sq.confirmText}>Did you send it?</Text>
              <View style={sq.confirmRow}>
                <TouchableOpacity
                  style={sq.confirmYes}
                  onPress={() => confirmSent(pendingSendRef.current!)}
                  activeOpacity={0.85}
                >
                  <Text style={sq.confirmYesText}>✅ Yes, sent</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={sq.confirmNo}
                  onPress={() => { pendingSendRef.current = null; setShowConfirmSent(false); }}
                  activeOpacity={0.8}
                >
                  <Text style={sq.confirmNoText}>Not yet</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {queueItems[queuePos] ? (() => {
            const item = queueItems[queuePos];
            const initials = item.contact_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            return (
              <ScrollView contentContainerStyle={sq.modalBody} keyboardShouldPersistTaps="handled">
                {/* Contact info */}
                <View style={sq.contactRow}>
                  <View style={sq.avatar}><Text style={sq.avatarText}>{initials}</Text></View>
                  <View>
                    <Text style={sq.contactName}>{item.contact_name}</Text>
                    <Text style={sq.contactPhone}>{item.phone || 'No phone'}</Text>
                    <Text style={sq.dueDate}>Due: {item.due_date} · {CHANNEL_ICON[item.channel]}</Text>
                  </View>
                </View>

                {/* Message preview / edit */}
                <TextInput
                  style={sq.msgBox}
                  value={editingMessage ?? item.message}
                  onChangeText={setEditingMessage}
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                />

                {/* Actions */}
                {item.channel === 'text' ? (
                  <TouchableOpacity
                    style={[sq.openSmsBtn, !item.phone && { opacity: 0.4 }]}
                    onPress={() => handleSendItem(item)}
                    disabled={!item.phone}
                    activeOpacity={0.85}
                  >
                    <Text style={sq.openSmsBtnText}>📱 Open in Messages →</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={sq.openSmsBtn} onPress={() => handleSendItem(item)} activeOpacity={0.85}>
                    <Text style={sq.openSmsBtnText}>{item.channel === 'call' ? '📞 Mark Call Done →' : '📧 Mark Email Done →'}</Text>
                  </TouchableOpacity>
                )}

                <View style={sq.secondaryBtns}>
                  <TouchableOpacity style={sq.editBtn} onPress={() => setEditingMessage(editingMessage === null ? item.message : null)} activeOpacity={0.8}>
                    <Text style={sq.editBtnText}>{editingMessage !== null ? '↩ Reset' : '✏️ Edit'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={sq.skipBtn} onPress={handleSkipItem} activeOpacity={0.8}>
                    <Text style={sq.skipBtnText}>⏭ Skip</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            );
          })() : (
            <View style={sq.allDone}>
              <Text style={sq.allDoneIcon}>🎉</Text>
              <Text style={sq.allDoneTitle}>All done!</Text>
              <Text style={sq.allDoneSub}>Queue complete. Great work.</Text>
              <TouchableOpacity style={sq.openSmsBtn} onPress={() => setShowQueueModal(false)} activeOpacity={0.85}>
                <Text style={sq.openSmsBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* Mass Text Modal */}
      <Modal visible={showMassTextModal} animationType="slide" transparent>
        <View style={mt.overlay}>
          <View style={mt.sheet}>
            <View style={mt.handle} />
            <View style={mt.header}>
              <Text style={mt.title}>Mass Text</Text>
              <TouchableOpacity onPress={() => setShowMassTextModal(false)}>
                <Text style={mt.close}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Plan limit badge */}
            <View style={mt.limitRow}>
              <Text style={mt.limitText}>
                {selectedContactIds.size} / {MASS_LIMIT} selected
              </Text>
              <View style={mt.planBadge}>
                <Text style={mt.planBadgeText}>{userPlan === 'elite' ? 'ELITE' : 'PRO'}</Text>
              </View>
            </View>

            {/* Contact search + picker */}
            <TextInput
              style={mt.input}
              value={contactSearch}
              onChangeText={setContactSearch}
              placeholder="Search contacts…"
              placeholderTextColor={colors.grey}
            />

            <ScrollView style={mt.contactList} keyboardShouldPersistTaps="handled">
              {allContacts
                .filter(c => {
                  const q = contactSearch.toLowerCase();
                  return !q || `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) || c.phone?.includes(q);
                })
                .map(c => {
                  const selected = selectedContactIds.has(c.id);
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[mt.contactRow, selected && mt.contactRowSelected]}
                      onPress={() => toggleContact(c.id)}
                      activeOpacity={0.8}
                    >
                      <View style={[mt.checkbox, selected && mt.checkboxChecked]}>
                        {selected && <Text style={mt.checkmark}>✓</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={mt.contactName}>{c.first_name} {c.last_name}</Text>
                        {c.phone ? <Text style={mt.contactPhone}>{c.phone}</Text> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>

            {/* Message */}
            <TextInput
              style={[mt.input, { height: 90, textAlignVertical: 'top', marginTop: spacing.sm }]}
              value={massMsg}
              onChangeText={setMassMsg}
              placeholder="Hey {{first_name}}, …"
              placeholderTextColor={colors.grey}
              multiline
            />
            <Text style={mt.tip}>Use {'{{first_name}}'} for personalization.</Text>

            <TouchableOpacity
              style={[mt.sendBtn, (!massMsg.trim() || selectedContactIds.size === 0) && { opacity: 0.4 }]}
              disabled={!massMsg.trim() || selectedContactIds.size === 0}
              onPress={sendMassText}
              activeOpacity={0.85}
            >
              <Text style={mt.sendBtnText}>
                Send to {selectedContactIds.size} contact{selectedContactIds.size !== 1 ? 's' : ''} →
              </Text>
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function AccordionSection({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <TouchableOpacity style={s.sectionHeader} onPress={onToggle} activeOpacity={0.8}>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.sectionChevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && <View style={s.sectionBody}>{children}</View>}
    </View>
  );
}

function SequenceBubble({ seq, onPress }: { seq: Sequence; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.bubble} onPress={onPress} activeOpacity={0.8}>
      <View style={s.bubbleTop}>
        <View style={s.industryBadge}>
          <Text style={s.industryBadgeText}>{seq.industry}</Text>
        </View>
        <Text style={s.bubbleSteps}>{seq.sequence_steps?.length ?? 0} steps</Text>
      </View>
      <Text style={s.bubbleName} numberOfLines={2}>{seq.name}</Text>
      <Text style={s.bubbleDesc} numberOfLines={2}>{seq.description}</Text>
    </TouchableOpacity>
  );
}

function DetailView({ seq, onBack }: { seq: Sequence; onBack: () => void }) {
  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.backArrow}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{seq.name}</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <View style={s.detailMeta}>
          <View style={s.industryBadge}>
            <Text style={s.industryBadgeText}>{seq.industry}</Text>
          </View>
          {seq.is_template && (
            <View style={s.templateBadge}>
              <Text style={s.templateBadgeText}>Template</Text>
            </View>
          )}
        </View>
        {seq.description ? <Text style={s.detailDesc}>{seq.description}</Text> : null}

        <Text style={s.stepsTitle}>Steps</Text>
        {(seq.sequence_steps ?? []).sort((a, b) => a.step_number - b.step_number).map(step => (
          <View key={step.id} style={s.stepRow}>
            <View style={s.stepRowLeft}>
              <Text style={s.stepRowIcon}>{CHANNEL_ICON[step.channel]}</Text>
              <View>
                <Text style={s.stepRowLabel}>Step {step.step_number} · Day {step.delay_days}</Text>
                <Text style={s.stepRowChannel}>{step.channel}</Text>
              </View>
            </View>
            <Text style={s.stepRowMsg} numberOfLines={3}>{step.message_template}</Text>
          </View>
        ))}

        <TouchableOpacity
          style={s.assignBtn}
          onPress={() => Alert.alert('Assign to Contact', 'Contact search coming soon. For now, open a contact and assign from their profile.')}
          activeOpacity={0.85}
        >
          <Text style={s.assignBtnText}>Assign to Contact</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    backgroundColor: colors.ink2, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  logoMark: {
    width: 32, height: 32, borderRadius: radius.sm,
    backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center',
  },
  logoMarkText: { color: colors.ink, fontWeight: '900', fontSize: 16 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.4 },
  backArrow: { color: colors.gold, fontSize: 14, fontWeight: '600' },
  massTextBtn: {
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  massTextBtnText: { color: colors.gold, fontSize: 11, fontWeight: '700' },

  section: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.ink4,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.white },
  sectionChevron: { color: colors.grey2, fontSize: 11 },
  sectionBody: { paddingBottom: spacing.md },

  bubbleScroll: { paddingHorizontal: spacing.md, paddingBottom: 4, gap: spacing.sm, flexDirection: 'row' },

  bubble: {
    width: screenWidth * 0.6,
    backgroundColor: colors.ink3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ink4,
    padding: spacing.md,
    gap: spacing.xs,
  },
  bubbleTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  bubbleName: { fontSize: 13, fontWeight: '700', color: colors.white },
  bubbleDesc: { fontSize: 11, color: colors.grey2, lineHeight: 16 },
  bubbleSteps: { fontSize: 10, color: colors.grey, fontWeight: '600' },

  industryBadge: {
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  industryBadgeText: { fontSize: 9, fontWeight: '700', color: colors.gold, letterSpacing: 0.5, textTransform: 'uppercase' },

  newBubble: {
    width: screenWidth * 0.4,
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  newBubbleIcon: { fontSize: 24, color: colors.ink, fontWeight: '800' },
  newBubbleText: { fontSize: 12, fontWeight: '700', color: colors.ink },

  massBubble: {
    width: screenWidth * 0.55,
    backgroundColor: colors.ink3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ink4,
    padding: spacing.md,
    gap: spacing.xs,
  },
  massBubbleDate: { fontSize: 10, color: colors.gold, fontWeight: '600' },
  massBubbleCount: { fontSize: 11, fontWeight: '700', color: colors.white },
  massBubbleMsg: { fontSize: 11, color: colors.grey2, lineHeight: 16 },

  emptySection: { padding: spacing.lg, alignItems: 'center' },
  emptySectionText: { color: colors.grey, fontSize: 13 },

  // History
  historyDateHeader: {
    fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 0.8,
    textTransform: 'uppercase', marginTop: spacing.md, marginBottom: spacing.xs,
  },
  historyRow: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  historyChannel: { fontSize: 18, lineHeight: 22 },
  historyContact: { fontSize: 12, fontWeight: '700', color: colors.ink, marginBottom: 2 },
  historyMsg: { fontSize: 11, color: colors.grey2, lineHeight: 16 },

  // Detail
  detailMeta: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  templateBadge: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  templateBadgeText: { fontSize: 9, fontWeight: '700', color: colors.grey3, letterSpacing: 0.5 },
  detailDesc: { fontSize: 13, color: colors.grey2, lineHeight: 19, marginBottom: spacing.lg },
  stepsTitle: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: spacing.md },
  stepRow: {
    backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  stepRowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  stepRowIcon: { fontSize: 18 },
  stepRowLabel: { fontSize: 12, fontWeight: '700', color: colors.white },
  stepRowChannel: { fontSize: 10, color: colors.grey2, textTransform: 'uppercase', letterSpacing: 0.5 },
  stepRowMsg: { fontSize: 12, color: colors.grey3, lineHeight: 18 },
  assignBtn: {
    backgroundColor: colors.gold, borderRadius: radius.sm,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.xl,
  },
  assignBtnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },

  // Builder
  fieldLabel: { fontSize: 11, fontWeight: '600', color: colors.grey3, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: spacing.sm, marginBottom: 4 },
  fieldInput: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.sm, padding: spacing.sm + 2, color: colors.white, fontSize: 14, marginBottom: spacing.sm,
  },
  industryPill: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
  },
  industryPillActive: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder },
  industryPillText: { color: colors.grey2, fontSize: 12, fontWeight: '600' },
  industryPillTextActive: { color: colors.gold },
  stepCard: {
    backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4,
    padding: spacing.md, marginBottom: spacing.md,
  },
  stepCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  stepNum: { fontSize: 12, fontWeight: '700', color: colors.gold },
  removeStep: { color: colors.grey, fontSize: 14 },
  stepFieldLabel: { fontSize: 10, fontWeight: '600', color: colors.grey3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 },
  stepInput: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.sm, padding: spacing.sm, color: colors.white, fontSize: 13, marginBottom: spacing.sm,
  },
  channelPill: {
    borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  channelPillActive: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder },
  channelPillText: { color: colors.grey2, fontSize: 12 },
  channelPillTextActive: { color: colors.gold, fontWeight: '700' },
  aiRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  addStepBtn: {
    borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.sm, borderStyle: 'dashed',
    padding: spacing.md, alignItems: 'center', marginBottom: spacing.lg,
  },
  addStepBtnText: { color: colors.gold, fontWeight: '600', fontSize: 13 },
  saveBtn: {
    backgroundColor: colors.gold, borderRadius: radius.sm,
    padding: spacing.md, alignItems: 'center',
  },
  saveBtnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
});

const mt = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: {
    backgroundColor: colors.ink2, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: spacing.lg, paddingBottom: 36, maxHeight: '88%',
  },
  handle: { width: 36, height: 4, backgroundColor: colors.ink4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  title: { fontSize: 17, fontWeight: '800', color: colors.white },
  close: { color: colors.grey2, fontSize: 18 },
  limitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  limitText: { fontSize: 12, color: colors.grey3, fontWeight: '600' },
  planBadge: {
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2,
  },
  planBadgeText: { color: colors.gold, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg, padding: spacing.sm + 2, color: colors.white, fontSize: 14,
    marginBottom: 4,
  },
  contactList: { maxHeight: 200, marginBottom: spacing.sm },
  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.sm, borderRadius: radius.md, marginBottom: 2,
  },
  contactRowSelected: { backgroundColor: colors.goldBg },
  checkbox: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.ink4,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.gold, borderColor: colors.gold },
  checkmark: { color: colors.ink, fontSize: 11, fontWeight: '800' },
  contactName: { fontSize: 13, fontWeight: '600', color: colors.white },
  contactPhone: { fontSize: 11, color: colors.grey2 },
  tip: { fontSize: 11, color: colors.grey, marginBottom: spacing.md },
  sendBtn: {
    backgroundColor: colors.gold, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.sm,
  },
  sendBtnText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  // Template filter pills
  filterRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xs },
  filterPill: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 5,
  },
  filterPillActive: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder },
  filterPillText: { color: colors.grey2, fontSize: 12, fontWeight: '600' },
  filterPillTextActive: { color: colors.gold },
});

// ── Queue / Ready-to-Send styles ─────────────────────────────────────────────
const sq = StyleSheet.create({
  // Queue status card
  card: {
    margin: spacing.lg, marginTop: 0,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg, padding: spacing.md,
  },
  cardTop: { marginBottom: spacing.sm },
  cardCount: { fontSize: 15, fontWeight: '800', color: colors.white },
  cardSub: { fontSize: 12, color: colors.grey2, marginTop: 2 },
  limitNote: { fontSize: 11, color: colors.orange, marginBottom: spacing.sm },
  cardBtns: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  startBtn: { flex: 2, backgroundColor: colors.gold, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center' },
  startBtnText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  saveBtn: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center' },
  saveBtnText: { color: colors.grey2, fontWeight: '600', fontSize: 12 },
  // Full-screen modal
  modal: { flex: 1, backgroundColor: colors.ink },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    backgroundColor: colors.ink2, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  exitBtn: { color: colors.grey2, fontSize: 14, fontWeight: '600' },
  posLabel: { color: colors.grey, fontSize: 13 },
  progressTrack: { height: 3, backgroundColor: colors.ink4 },
  progressFill: { height: 3, backgroundColor: colors.gold },
  modalBody: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  // Contact info
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.goldBg, borderWidth: 1.5, borderColor: colors.goldBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.gold, fontWeight: '800', fontSize: 16 },
  contactName: { fontSize: 16, fontWeight: '800', color: colors.white },
  contactPhone: { fontSize: 13, color: colors.grey2, marginTop: 2 },
  dueDate: { fontSize: 11, color: colors.grey, marginTop: 2 },
  // Message box
  msgBox: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg, padding: spacing.md, color: colors.white,
    fontSize: 14, lineHeight: 22, minHeight: 120,
  },
  // Buttons
  openSmsBtn: { backgroundColor: colors.gold, borderRadius: radius.lg, padding: spacing.md + 2, alignItems: 'center' },
  openSmsBtnText: { color: colors.ink, fontWeight: '800', fontSize: 15 },
  secondaryBtns: { flexDirection: 'row', gap: spacing.sm },
  editBtn: { flex: 1, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center' },
  editBtnText: { color: colors.grey2, fontWeight: '600', fontSize: 13 },
  skipBtn: { flex: 1, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center' },
  skipBtnText: { color: colors.grey2, fontWeight: '600', fontSize: 13 },
  // All done
  allDone: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  allDoneIcon: { fontSize: 56 },
  allDoneTitle: { fontSize: 24, fontWeight: '800', color: colors.white },
  allDoneSub: { fontSize: 14, color: colors.grey2 },
  // "Did you send it?" confirmation banner
  confirmBanner: {
    backgroundColor: '#1a2a1a', borderBottomWidth: 1, borderBottomColor: '#2a4a2a',
    padding: spacing.lg, gap: spacing.sm,
  },
  confirmText: { fontSize: 16, fontWeight: '800', color: colors.white, textAlign: 'center' },
  confirmRow: { flexDirection: 'row', gap: spacing.sm },
  confirmYes: { flex: 1, backgroundColor: '#22c55e', borderRadius: radius.lg, padding: spacing.md, alignItems: 'center' },
  confirmYesText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  confirmNo: { flex: 1, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center' },
  confirmNoText: { color: colors.grey2, fontWeight: '600', fontSize: 15 },
});
