/* Test-only browser transport. Inject BEFORE app startup with addInitScript.
 * Never imported by the application. Intercepts every /api request so browser
 * regression tests cannot create chat data, mark real chats read, or send push.
 */
(() => {
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const DIRECT = "11111111-1111-4111-8111-111111111111";
  const GROUP = "22222222-2222-4222-8222-222222222222";
  const EMPTY = "33333333-3333-4333-8333-333333333333";
  const OLDER = "44444444-4444-4444-8444-444444444444";
  const DENIED = "55555555-5555-4555-8555-555555555555";
  const ACTIVITY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const key = "outfy-chat-browser-regression";
  const now = new Date().toISOString();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const me = {
    id: A, username: "chat_tester", displayName: "Chat Tester",
    displayNameVisibility: "everyone", homeCity: null, homeLocation: null,
    isProfilePrivate: false,
    notificationPreferences: { activities: true, connections: true, messages: true, reminders: true },
  };
  const friend = { id: B, username: "lucia", displayName: "Lucía", avatarUrl: null };
  const stranger = { id: C, username: "stranger", displayName: null, avatarUrl: null };
  const message = (n, conversationId = DIRECT, senderId = B) => ({
    id: id(n), conversationId, senderId,
    body: `History ${n}`, createdAt: new Date(Date.now() - (70 - n) * 60_000).toISOString(),
    sender: senderId === A ? { ...me, avatarUrl: null } : friend,
  });
  const base = {
    createdAt: now, updatedAt: now, lastMessageAt: now, unreadCount: 2, activity: null, otherUser: friend,
  };
  const initial = () => ({
    conversations: [
      { ...base, id: DIRECT, type: "direct", lastMessage: message(60) },
      { ...base, id: GROUP, type: "activity", otherUser: null,
        activity: { id: ACTIVITY, title: "Weekend walking plan with friends", status: "completed", category: "sports" },
        lastMessage: { ...message(61, GROUP), body: "See you at the plan" } },
      { ...base, id: EMPTY, type: "direct", otherUser: { ...stranger, username: "empty_friend" },
        lastMessage: null, lastMessageAt: null, unreadCount: 0 },
      { ...base, id: OLDER, type: "direct", otherUser: { ...friend, username: "older_friend", displayName: "Older friend" },
        lastMessage: { ...message(62, OLDER), body: "Older conversation" } },
    ],
    messages: {
      [DIRECT]: Array.from({ length: 60 }, (_, i) => message(i + 1, DIRECT, i % 2 ? A : B)),
      [GROUP]: [message(61, GROUP), { ...message(63, GROUP, A), body: "Looking forward to it" }],
      [EMPTY]: [], [OLDER]: [message(62, OLDER)],
    },
    calls: [], next: 100, memberRole: "participant", activityStatus: "completed",
    denied: [], failNextSend: false, failNextOpen: false, failInbox: false,
  });
  let state;
  try { state = JSON.parse(sessionStorage.getItem(key)) ?? initial(); } catch { state = initial(); }
  const save = () => sessionStorage.setItem(key, JSON.stringify(state));
  window.__chatFixture = {
    state, ids: { A, B, C, DIRECT, GROUP, EMPTY, OLDER, DENIED, ACTIVITY },
    save,
    reset() { sessionStorage.removeItem(key); location.reload(); },
  };
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.origin);
    if (!url.pathname.startsWith("/api/")) return originalFetch(input, options);
    const method = options.method ?? "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    state.calls.push({ path: url.pathname, query: url.search, method, body });
    save();
    const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
      status, headers: { "content-type": "application/json" },
    });
    const error = (status, code) => json({ error: "Fixture request rejected", code }, status);
    const path = url.pathname;
    if (path === "/api/auth/session") return json({ authenticated: true, user: me });
    if (path === "/api/auth/profile/avatar") return json({ avatarUrl: null });
    if (path === "/api/notifications/unread-count") return json({ unreadCount: 0 });
    if (path === "/api/notifications") return json({ notifications: [], nextCursor: null });
    if (path === "/api/connections") return json({ incoming: [], outgoing: [], accepted: [] });
    if (path.startsWith("/api/connections/with/")) return json({
      relationship: path.endsWith(B) ? { id: id(999), status: "accepted", direction: "outgoing" } : null,
    });
    if (path.startsWith("/api/auth/users/")) {
      const username = decodeURIComponent(path.split("/").at(-1));
      return json({ profile: {
        ...(username === "lucia" ? friend : stranger), username,
        displayNameVisibility: "friends", isOwnProfile: false,
        isPrivate: false, isProfilePrivate: false, city: null, country: null,
      } });
    }
    if (path.startsWith("/api/activities/user/")) return json({
      activities: [], reputation: { averageRating: null, reviewCount: 0, completedActivityCount: 0, recentReviews: [] },
    });
    if (path === `/api/activities/${ACTIVITY}`) return json({ activity: {
      id: ACTIVITY, title: "Weekend walking plan with friends", description: "Browser regression fixture",
      visibility: "public", category: "sports", subcategory: "hiking", status: state.activityStatus,
      startsAt: "2026-10-01T12:00:00Z", endsAt: "2026-10-01T14:00:00Z", timezoneName: "Europe/Madrid",
      locationType: "physical", countryCode: "ES", regionCode: null, regionName: null,
      city: "Madrid", meetingPoint: "Park", onlinePlatform: null, participationMode: "unlimited",
      maxParticipants: null, costType: "free", estimatedCost: null, currency: "EUR",
      organizer: { username: "lucia", displayName: "Lucía" }, memberCount: 2,
      members: [
        { ...friend, role: "organizer" }, { ...me, avatarUrl: null, role: "participant" },
      ],
      averageRating: null, reviewCount: 0, reviews: [], canReview: false, myReview: null,
      membershipRole: state.memberRole,
    } });
    if (path === "/api/chat/conversations") {
      if (state.failInbox) return error(500, "chat_unavailable");
      const startedEmpty = state.conversations.find(c => c.id === EMPTY && c.lastMessage);
      if (url.searchParams.get("cursor")) {
        return json({ conversations: [state.conversations.find(c => c.id === OLDER)], nextCursor: null });
      }
      return json({
        conversations: [
          ...(startedEmpty ? [startedEmpty] : []),
          ...state.conversations.filter(c => [DIRECT, GROUP].includes(c.id)),
          ...(!startedEmpty ? [state.conversations.find(c => c.id === EMPTY)] : []),
        ],
        nextCursor: "fixture-inbox-older",
      });
    }
    if (path === "/api/chat/direct" && method === "POST") {
      await new Promise(resolve => setTimeout(resolve, 150));
      if (state.failNextOpen) { state.failNextOpen = false; save(); return error(500, "chat_unavailable"); }
      return body.userId === B
        ? json({ conversation: state.conversations.find(c => c.id === DIRECT) })
        : error(403, "chat_connection_not_accepted");
    }
    if (path === `/api/chat/activities/${ACTIVITY}`) {
      return state.memberRole
        ? json({ conversation: state.conversations.find(c => c.id === GROUP) })
        : error(403, "chat_access_denied");
    }
    const match = path.match(/^\/api\/chat\/conversations\/([^/]+)(?:\/(messages|read))?$/);
    if (match) {
      const [, conversationId, action] = match;
      const conversation = state.conversations.find(c => c.id === conversationId);
      if (state.denied.includes(conversationId) || conversationId === DENIED) return error(403, "chat_access_denied");
      if (!conversation) return error(404, "chat_not_found");
      if (!action) return json({ conversation });
      if (action === "read") {
        conversation.unreadCount = 0; save();
        return json({ success: true, readAt: new Date().toISOString() });
      }
      const messages = state.messages[conversationId];
      if (method === "POST") {
        await new Promise(resolve => setTimeout(resolve, 150));
        if (state.failNextSend) { state.failNextSend = false; save(); return error(500, "chat_unavailable"); }
        const text = body.body.trim();
        if (!text || [...text].length > 2000) return error(400, "invalid_message_body");
        const saved = {
          ...message(++state.next, conversationId, A), body: text, createdAt: new Date().toISOString(),
        };
        messages.push(saved);
        conversation.lastMessage = saved; conversation.lastMessageAt = saved.createdAt;
        conversation.updatedAt = saved.createdAt;
        save();
        return json({ message: saved }, 201);
      }
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
      const cursor = url.searchParams.get("cursor");
      const end = cursor ? Number(cursor.split("-").at(-1)) : messages.length;
      const start = Math.max(0, end - limit);
      return json({ messages: messages.slice(start, end), nextCursor: start > 0 ? `fixture-older-${start}` : null });
    }
    return error(404, "unhandled_browser_fixture_route");
  };
})();
