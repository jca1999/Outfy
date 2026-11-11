import { Router, type IRouter, type Request } from "express";

import { findConnection } from "../lib/connections";
import { createNotification, notifyInvitationResponse } from "../lib/notifications";
import { getSupabaseAdmin } from "../lib/supabase";
import { currentSession } from "./auth";

type ActivityRequest = {
  title?: unknown;
  description?: unknown;
  visibility?: unknown;
  category?: unknown;
  subcategory?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  timezoneName?: unknown;
  locationType?: unknown;
  countryCode?: unknown;
  regionCode?: unknown;
  regionName?: unknown;
  city?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  meetingPoint?: unknown;
  onlinePlatform?: unknown;
  participationMode?: unknown;
  maxParticipants?: unknown;
  costType?: unknown;
  estimatedCost?: unknown;
  currency?: unknown;
  [key: string]: unknown;
};

type ValidatedActivity = {
  title: string;
  description: string | null;
  visibility: "public" | "friends" | "invite_only";
  category: string;
  subcategory: string;
  starts_at: string;
  ends_at: string | null;
  timezone_name: string;
  location_type: "physical" | "online";
  country_code: string | null;
  region_code: string | null;
  region_name: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  meeting_point: string | null;
  online_platform: string | null;
  participation_mode: "limited" | "unlimited";
  max_participants: number | null;
  cost_type: "free" | "paid" | "each_own";
  estimated_cost: number | null;
  currency: string | null;
};

type MembershipRpcRow = {
  result: string;
  member_count: number | null;
  max_participants: number | null;
};

type ActivityReviewRpcRow = {
  result: string;
  review_id: string | null;
  rating: number | null;
  comment: string | null;
  average_rating: number | null;
  review_count: number | null;
};
const AVATAR_BUCKET = "avatars";
const AVATAR_SIGNED_URL_SECONDS = 60 * 60;
const router: IRouter = Router();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVITY_CATEGORIES = new Set([
  "sports",
  "music",
  "movies",
  "outdoors",
  "social",
  "food",
  "gaming",
  "board_games",
  "culture",
  "travel",
  "learning",
  "other",
]);
const EXPLORE_RESULT_LIMIT = 30;
const ACTIVITY_AUTO_COMPLETE_MS = 24 * 60 * 60 * 1000;
const SERVER_OWNED_FIELDS = new Set([
  "creatorId",
  "creator_id",
  "status",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "role",
]);

async function completeExpiredActivities() {
  const supabase = getSupabaseAdmin();

  const now = new Date();
  const nowIso = now.toISOString();

  const fallbackEndIso = new Date(
    now.getTime() - ACTIVITY_AUTO_COMPLETE_MS,
  ).toISOString();

  const [activitiesWithEndResult, activitiesWithoutEndResult] =
    await Promise.all([
      supabase
        .from("activities")
        .update({
          status: "completed",
        })
        .eq("status", "active")
        .not("ends_at", "is", null)
        .lte("ends_at", nowIso),

      supabase
        .from("activities")
        .update({
          status: "completed",
        })
        .eq("status", "active")
        .is("ends_at", null)
        .lte("starts_at", fallbackEndIso),
    ]);

  if (activitiesWithEndResult.error) {
    throw activitiesWithEndResult.error;
  }

  if (activitiesWithoutEndResult.error) {
    throw activitiesWithoutEndResult.error;
  }
}

function bodyOf(request: Request): ActivityRequest {
  return request.body && typeof request.body === "object"
    ? (request.body as ActivityRequest)
    : {};
}

function membershipRpcRow(data: unknown): MembershipRpcRow | null {
  if (!Array.isArray(data) || data.length !== 1) return null;

  const row = data[0] as Record<string, unknown>;
  if (
    typeof row.result !== "string" ||
    (row.member_count !== null && typeof row.member_count !== "number") ||
    (row.max_participants !== null && typeof row.max_participants !== "number")
  ) {
    return null;
  }

  return {
    result: row.result,
    member_count: row.member_count,
    max_participants: row.max_participants,
  };
}

function nullableRpcNumber(value: unknown): number | null | undefined {
  if (value === null) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Number(value))
  ) {
    return Number(value);
  }

  return undefined;
}

function activityReviewRpcRow(data: unknown): ActivityReviewRpcRow | null {
  if (!Array.isArray(data) || data.length !== 1) return null;
  if (!data[0] || typeof data[0] !== "object") return null;

  const row = data[0] as Record<string, unknown>;

  const rating = nullableRpcNumber(row.rating);
  const averageRating = nullableRpcNumber(row.average_rating);
  const reviewCount = nullableRpcNumber(row.review_count);

  if (
    typeof row.result !== "string" ||
    (row.review_id !== null && typeof row.review_id !== "string") ||
    rating === undefined ||
    (row.comment !== null && typeof row.comment !== "string") ||
    averageRating === undefined ||
    reviewCount === undefined
  ) {
    return null;
  }

  return {
    result: row.result,
    review_id: row.review_id as string | null,
    rating,
    comment: row.comment as string | null,
    average_rating: averageRating,
    review_count: reviewCount,
  };
}

function requiredString(value: unknown, name: string, maxLength?: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`);
  }

  const normalized = value.trim();
  if (maxLength && normalized.length > maxLength) {
    throw new Error(`${name} is too long`);
  }
  return normalized;
}

function optionalString(value: unknown, name: string, maxLength?: number) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error(`${name} must be a string`);

  const normalized = value.trim();
  if (!normalized) return null;
  if (maxLength && normalized.length > maxLength) {
    throw new Error(`${name} is too long`);
  }
  return normalized;
}

function optionalNumber(value: unknown, name: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a valid number`);
  }
  return value;
}

function validDate(value: unknown, name: string) {
  const dateString = requiredString(value, name);
  const timestamp = Date.parse(dateString);
  if (!Number.isFinite(timestamp)) throw new Error(`${name} is invalid`);
  return { value: new Date(timestamp).toISOString(), timestamp };
}

function validateActivity(body: ActivityRequest): ValidatedActivity {
  if (Object.keys(body).some((key) => SERVER_OWNED_FIELDS.has(key))) {
    throw new Error("Server-owned activity fields are not accepted");
  }

  const title = requiredString(body.title, "title", 120);
  const description = optionalString(body.description, "description", 5000);
  const category = requiredString(body.category, "category");
  const subcategory = requiredString(body.subcategory, "subcategory");
  const startsAt = validDate(body.startsAt, "startsAt");
  const endsAt =
    body.endsAt === undefined || body.endsAt === null || body.endsAt === ""
      ? null
      : validDate(body.endsAt, "endsAt");
  const timezoneName = requiredString(body.timezoneName, "timezoneName");

  if (endsAt && endsAt.timestamp <= startsAt.timestamp) {
    throw new Error("endsAt must be later than startsAt");
  }

  if (body.locationType !== "physical" && body.locationType !== "online") {
    throw new Error("locationType is invalid");
  }
  const locationType = body.locationType;
  const city = optionalString(body.city, "city");
  if (locationType === "physical" && !city) {
    throw new Error("city is required for physical activities");
  }

  const rawCountryCode = optionalString(body.countryCode, "countryCode");
  const countryCode = rawCountryCode?.toUpperCase() ?? null;
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error("countryCode must contain two letters");
  }

  const latitude = optionalNumber(body.latitude, "latitude");
  const longitude = optionalNumber(body.longitude, "longitude");
  if ((latitude === null) !== (longitude === null)) {
    throw new Error("latitude and longitude must be supplied together");
  }
  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    throw new Error("latitude is out of range");
  }
  if (longitude !== null && (longitude < -180 || longitude > 180)) {
    throw new Error("longitude is out of range");
  }

  if (
    body.participationMode !== "limited" &&
    body.participationMode !== "unlimited"
  ) {
    throw new Error("participationMode is invalid");
  }
  const participationMode = body.participationMode;
  let maxParticipants: number | null = null;
  if (participationMode === "limited") {
    if (
      typeof body.maxParticipants !== "number" ||
      !Number.isInteger(body.maxParticipants) ||
      body.maxParticipants < 2
    ) {
      throw new Error("maxParticipants must be an integer of at least 2");
    }
    maxParticipants = body.maxParticipants;
  }

  if (
    body.costType !== "free" &&
    body.costType !== "paid" &&
    body.costType !== "each_own"
  ) {
    throw new Error("costType is invalid");
  }
  const costType = body.costType;
  let estimatedCost = optionalNumber(body.estimatedCost, "estimatedCost");
  let currency =
    optionalString(body.currency, "currency")?.toUpperCase() ?? null;

  if (costType === "free") {
    estimatedCost = null;
    currency = null;
  } else {
    if (estimatedCost !== null && estimatedCost <= 0) {
      throw new Error("estimatedCost must be greater than zero");
    }
    if (
      estimatedCost !== null &&
      (estimatedCost > 99_999_999.99 || !Number.isInteger(estimatedCost * 100))
    ) {
      throw new Error("estimatedCost must fit numeric(10,2)");
    }
    if (currency && !/^[A-Z]{3}$/.test(currency)) {
      throw new Error("currency must contain three letters");
    }
    if (costType === "paid" && (estimatedCost === null || currency === null)) {
      throw new Error("Paid activities require estimatedCost and currency");
    }
  }

  const visibility = body.visibility === undefined ? "public" : body.visibility;

  if (
    visibility !== "public" &&
    visibility !== "friends" &&
    visibility !== "invite_only"
  ) {
    throw new Error("visibility is invalid");
  }

  return {
    title,
    description,
    visibility,
    category,
    subcategory,
    starts_at: startsAt.value,
    ends_at: endsAt?.value ?? null,
    timezone_name: timezoneName,
    location_type: locationType,
    country_code: locationType === "physical" ? countryCode : null,
    region_code:
      locationType === "physical"
        ? optionalString(body.regionCode, "regionCode")
        : null,
    region_name:
      locationType === "physical"
        ? optionalString(body.regionName, "regionName")
        : null,
    city: locationType === "physical" ? city : null,
    latitude: locationType === "physical" ? latitude : null,
    longitude: locationType === "physical" ? longitude : null,
    meeting_point:
      locationType === "physical"
        ? optionalString(body.meetingPoint, "meetingPoint")
        : null,
    online_platform:
      locationType === "online"
        ? optionalString(body.onlinePlatform, "onlinePlatform")
        : null,
    participation_mode: participationMode,
    max_participants: maxParticipants,
    cost_type: costType,
    estimated_cost: estimatedCost,
    currency,
  };
}

router.use("/activities", async (request, response, next) => {
  try {
    await completeExpiredActivities();
    next();
  } catch (error) {
    request.log.error(
      {
        err: error,
      },
      "Unable to complete expired activities",
    );

    response.status(500).json({
      error: "The activities could not be updated.",
    });
  }
});

router.post("/activities", async (request, response) => {
  let session;
  try {
    session = await currentSession(request, response);
  } catch (error) {
    request.log.error(
      { err: error },
      "Unable to authenticate activity creator",
    );
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  if (!session) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  let activity: ValidatedActivity;
  try {
    activity = validateActivity(bodyOf(request));
  } catch {
    response
      .status(400)
      .json({ error: "Check the activity details and try again." });
    return;
  }

  if (Date.parse(activity.starts_at) <= Date.now()) {
    response.status(400).json({
      error: "The activity start time must be in the future.",
      code: "activity_start_in_past",
    });
    return;
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("activities")
      .insert({ ...activity, creator_id: session.user.id })
      .select("id")
      .single();

    if (error || !data?.id) {
      request.log.error(
        { err: error, userId: session.user.id },
        "Unable to create activity",
      );
      response
        .status(500)
        .json({ error: "The activity could not be published." });
      return;
    }

    response.status(201).json({ activity: { id: data.id } });
  } catch (error) {
    request.log.error(
      { err: error, userId: session.user.id },
      "Unable to create activity",
    );
    response
      .status(500)
      .json({ error: "The activity could not be published." });
  }
});

router.get("/activities", async (request, response) => {
  let session;
  try {
    session = await currentSession(request, response);
  } catch (error) {
    request.log.error(
      { err: error },
      "Unable to authenticate activity explorer",
    );
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  if (!session) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  const search =
    typeof request.query.search === "string"
      ? request.query.search.trim().slice(0, 100)
      : "";
  const category =
    typeof request.query.category === "string"
      ? request.query.category.trim()
      : "";

  if (category && !ACTIVITY_CATEGORIES.has(category)) {
    response.status(400).json({ error: "The activity category is invalid." });
    return;
  }

  const selectedFields =
    "id,title,category,subcategory,starts_at,ends_at,timezone_name,location_type,city,online_platform,participation_mode,max_participants,status,activity_members(count)";
  const startsAfter = new Date().toISOString();

  function exploreQuery(searchColumn?: "title" | "city" | "description") {
    let query = getSupabaseAdmin()
      .from("activities")
      .select(selectedFields)
      .eq("status", "active")
      .eq("visibility", "public")
      .gt("starts_at", startsAfter);

    if (category) {
      query = query.eq("category", category);
    }

    if (search && searchColumn) {
      query = query.ilike(searchColumn, `%${search}%`);
    }

    return query
      .order("starts_at", { ascending: true })
      .limit(EXPLORE_RESULT_LIMIT);
  }

  try {
    const results = search
      ? await Promise.all([
          exploreQuery("title"),
          exploreQuery("city"),
          exploreQuery("description"),
        ])
      : [await exploreQuery()];
    const failedResult = results.find((result) => result.error);

    if (failedResult?.error) {
      request.log.error(
        { err: failedResult.error, userId: session.user.id },
        "Unable to explore activities",
      );
      response
        .status(500)
        .json({ error: "The activities could not be loaded." });
      return;
    }

    const activitiesById = new Map<
      string,
      NonNullable<(typeof results)[number]["data"]>[number]
    >();
    for (const result of results) {
      for (const activity of result.data ?? []) {
        activitiesById.set(activity.id, activity);
      }
    }

    const activities = [...activitiesById.values()]
      .sort(
        (left, right) =>
          Date.parse(left.starts_at) - Date.parse(right.starts_at),
      )
      .slice(0, EXPLORE_RESULT_LIMIT);

    response.json({
      activities: activities.map((activity) => ({
        id: activity.id,
        title: activity.title,
        category: activity.category,
        subcategory: activity.subcategory,
        startsAt: activity.starts_at,
        endsAt: activity.ends_at,
        timezoneName: activity.timezone_name,
        locationType: activity.location_type,
        city: activity.city,
        onlinePlatform: activity.online_platform,
        participationMode: activity.participation_mode,
        maxParticipants: activity.max_participants,
        memberCount: activity.activity_members?.[0]?.count ?? 0,
        status: activity.status,
      })),
    });
  } catch (error) {
    request.log.error(
      { err: error, userId: session.user.id },
      "Unable to explore activities",
    );
    response.status(500).json({ error: "The activities could not be loaded." });
  }
});

router.get("/activities/mine", async (request, response) => {
  let session;
  try {
    session = await currentSession(request, response);
  } catch (error) {
    request.log.error({ err: error }, "Unable to authenticate activity owner");
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  if (!session) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  try {
    const { data: activities, error: activitiesError } =
      await getSupabaseAdmin()
        .from("activities")
        .select(
          "id,title,category,subcategory,starts_at,ends_at,timezone_name,location_type,city,online_platform,participation_mode,max_participants,status,created_at,activity_members(count)",
        )
        .eq("creator_id", session.user.id);

    if (activitiesError) {
      request.log.error(
        { err: activitiesError, userId: session.user.id },
        "Unable to load created activities",
      );
      response
        .status(500)
        .json({ error: "The activities could not be loaded." });
      return;
    }

    if (!activities?.length) {
      response.json({ activities: [] });
      return;
    }

    const now = Date.now();
    const sortedActivities = [...activities].sort((left, right) => {
      const leftTimestamp = Date.parse(left.starts_at);
      const rightTimestamp = Date.parse(right.starts_at);
      const leftUpcoming = left.status === "active" && leftTimestamp >= now;
      const rightUpcoming = right.status === "active" && rightTimestamp >= now;

      if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
      if (leftUpcoming) return leftTimestamp - rightTimestamp;
      if (leftTimestamp !== rightTimestamp)
        return rightTimestamp - leftTimestamp;
      return Date.parse(right.created_at) - Date.parse(left.created_at);
    });

    response.json({
      activities: sortedActivities.map((activity) => ({
        id: activity.id,
        title: activity.title,
        category: activity.category,
        subcategory: activity.subcategory,
        startsAt: activity.starts_at,
        endsAt: activity.ends_at,
        timezoneName: activity.timezone_name,
        locationType: activity.location_type,
        city: activity.city,
        onlinePlatform: activity.online_platform,
        participationMode: activity.participation_mode,
        maxParticipants: activity.max_participants,
        memberCount: activity.activity_members?.[0]?.count ?? 0,
        status: activity.status,
      })),
    });
  } catch (error) {
    request.log.error(
      { err: error, userId: session.user.id },
      "Unable to load created activities",
    );
    response.status(500).json({ error: "The activities could not be loaded." });
  }
});

router.get("/activities/joined", async (request, response) => {
  let session;
  try {
    session = await currentSession(request, response);
  } catch (error) {
    request.log.error(
      { err: error },
      "Unable to authenticate joined activity owner",
    );
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  if (!session) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  try {
    const { data: memberships, error: membershipsError } =
      await getSupabaseAdmin()
        .from("activity_members")
        .select("activity_id")
        .eq("user_id", session.user.id)
        .eq("role", "participant");

    if (membershipsError) {
      request.log.error(
        { err: membershipsError, userId: session.user.id },
        "Unable to load joined activity memberships",
      );
      response
        .status(500)
        .json({ error: "The activities could not be loaded." });
      return;
    }

    const activityIds = [
      ...new Set(
        (memberships ?? []).map((membership) => membership.activity_id),
      ),
    ];

    if (activityIds.length === 0) {
      response.json({ activities: [] });
      return;
    }

    const { data: activities, error: activitiesError } =
      await getSupabaseAdmin()
        .from("activities")
        .select(
          "id,title,category,subcategory,starts_at,ends_at,timezone_name,location_type,city,online_platform,participation_mode,max_participants,status,activity_members(count)",
        )
        .in("id", activityIds)
        .neq("creator_id", session.user.id)
        .eq("status", "active")
        .order("starts_at", { ascending: true });

    if (activitiesError) {
      request.log.error(
        { err: activitiesError, userId: session.user.id },
        "Unable to load joined upcoming activities",
      );
      response
        .status(500)
        .json({ error: "The activities could not be loaded." });
      return;
    }

    response.json({
      activities: (activities ?? []).map((activity) => ({
        id: activity.id,
        title: activity.title,
        category: activity.category,
        subcategory: activity.subcategory,
        startsAt: activity.starts_at,
        endsAt: activity.ends_at,
        timezoneName: activity.timezone_name,
        locationType: activity.location_type,
        city: activity.city,
        onlinePlatform: activity.online_platform,
        participationMode: activity.participation_mode,
        maxParticipants: activity.max_participants,
        memberCount: activity.activity_members?.[0]?.count ?? 0,
        status: activity.status,
      })),
    });
  } catch (error) {
    request.log.error(
      { err: error, userId: session.user.id },
      "Unable to load joined upcoming activities",
    );
    response.status(500).json({ error: "The activities could not be loaded." });
  }
});

router.get("/activities/history", async (request, response) => {
  let session;
  try {
    session = await currentSession(request, response);
  } catch (error) {
    request.log.error(
      { err: error },
      "Unable to authenticate activity history owner",
    );
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  if (!session) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: memberships, error: membershipsError } = await supabase
      .from("activity_members")
      .select("activity_id")
      .eq("user_id", session.user.id);

    if (membershipsError) {
      request.log.error(
        { err: membershipsError, userId: session.user.id },
        "Unable to load historical activity memberships",
      );
      response
        .status(500)
        .json({ error: "The activities could not be loaded." });
      return;
    }

    const membershipActivityIds = [
      ...new Set(
        (memberships ?? []).map((membership) => membership.activity_id),
      ),
    ];

    let activitiesQuery = supabase
      .from("activities")
      .select(
        "id,creator_id,title,category,subcategory,starts_at,ends_at,timezone_name,location_type,city,online_platform,participation_mode,max_participants,status,activity_members(count)",
      )
      .order("starts_at", { ascending: false });

    activitiesQuery =
      membershipActivityIds.length > 0
        ? activitiesQuery.or(
            `creator_id.eq.${session.user.id},id.in.(${membershipActivityIds.join(",")})`,
          )
        : activitiesQuery.eq("creator_id", session.user.id);

    const { data: activities, error: activitiesError } = await activitiesQuery;

    if (activitiesError) {
      request.log.error(
        { err: activitiesError, userId: session.user.id },
        "Unable to load activity history",
      );
      response
        .status(500)
        .json({ error: "The activities could not be loaded." });
      return;
    }

    const now = Date.now();

    const historicalActivities = (activities ?? []).filter(
      (activity) =>
        activity.status === "completed" || activity.status === "cancelled",
    );

    if (historicalActivities.length === 0) {
      response.json({ activities: [] });
      return;
    }

    const activityIds = historicalActivities.map((activity) => activity.id);

    const organizerIds = [
      ...new Set(
        historicalActivities
          .map((activity) => activity.creator_id)
          .filter((creatorId) => creatorId !== session.user.id),
      ),
    ];

    const organizerUsernameById = new Map<string, string>();

    if (organizerIds.length > 0) {
      const { data: organizerProfiles, error: organizerProfilesError } =
        await supabase
          .from("profiles")
          .select("id,username")
          .in("id", organizerIds);

      if (organizerProfilesError) {
        request.log.warn(
          {
            err: organizerProfilesError,
            userId: session.user.id,
          },
          "Unable to load activity organizers for history",
        );
      } else {
        for (const profile of organizerProfiles ?? []) {
          organizerUsernameById.set(profile.id, profile.username);
        }
      }
    }

    const { data: reviews, error: reviewsError } = await supabase
      .from("activity_reviews")
      .select("activity_id,reviewer_id,rating,comment")
      .in("activity_id", activityIds);

    if (reviewsError) {
      request.log.error(
        { err: reviewsError, userId: session.user.id },
        "Unable to load activity reviews",
      );
      response
        .status(500)
        .json({ error: "The activity history could not be loaded." });
      return;
    }

    const reviewStats = new Map<string, { sum: number; count: number }>();

    const myReviews = new Map<
      string,
      { rating: number; comment: string | null }
    >();

    for (const review of reviews ?? []) {
      const current = reviewStats.get(review.activity_id) ?? {
        sum: 0,
        count: 0,
      };

      current.sum += review.rating;
      current.count += 1;

      reviewStats.set(review.activity_id, current);

      if (review.reviewer_id === session.user.id) {
        myReviews.set(review.activity_id, {
          rating: review.rating,
          comment: review.comment,
        });
      }
    }

    response.json({
      activities: historicalActivities.map((activity) => {
        const relationship =
          activity.creator_id === session.user.id ? "organizer" : "participant";

        const stats = reviewStats.get(activity.id);

        const canReview =
          relationship === "participant" && activity.status === "completed";

        return {
          id: activity.id,
          title: activity.title,
          category: activity.category,
          subcategory: activity.subcategory,
          startsAt: activity.starts_at,
          endsAt: activity.ends_at,
          timezoneName: activity.timezone_name,
          locationType: activity.location_type,
          city: activity.city,
          onlinePlatform: activity.online_platform,
          participationMode: activity.participation_mode,
          maxParticipants: activity.max_participants,
          memberCount: activity.activity_members?.[0]?.count ?? 0,
          status: activity.status,
          relationship,
          organizerUsername:
            relationship === "participant"
              ? organizerUsernameById.get(activity.creator_id) ?? null
              : null,
          canReview,
          averageRating:
            stats && stats.count > 0
              ? Number((stats.sum / stats.count).toFixed(2))
              : null,
          reviewCount: stats?.count ?? 0,
          myReview: myReviews.get(activity.id) ?? null,
        };
      }),
    });
  } catch (error) {
    request.log.error(
      { err: error, userId: session.user.id },
      "Unable to load activity history",
    );
    response.status(500).json({ error: "The activities could not be loaded." });
  }
});

router.put("/activities/:id/review", async (request, response) => {
  let session;

  try {
    session = await currentSession(request, response);
  } catch (error) {
    request.log.error(
      { err: error },
      "Unable to authenticate activity reviewer",
    );
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  if (!session) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  const activityId = request.params.id;

  if (!UUID_PATTERN.test(activityId)) {
    response.status(404).json({
      error: "Activity not found.",
      code: "activity_not_found",
    });
    return;
  }

  const body = bodyOf(request);
  const rating = body.rating;

  if (
    typeof rating !== "number" ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    response.status(400).json({
      error: "Rating must be between 1 and 5.",
      code: "invalid_rating",
    });
    return;
  }

  let comment: string | null = null;

  if (
    body.comment !== undefined &&
    body.comment !== null &&
    body.comment !== ""
  ) {
    if (typeof body.comment !== "string") {
      response.status(400).json({
        error: "The review comment is invalid.",
        code: "invalid_comment",
      });
      return;
    }

    const normalizedComment = body.comment.trim();

    if (normalizedComment.length > 1000) {
      response.status(400).json({
        error: "The review comment is too long.",
        code: "comment_too_long",
      });
      return;
    }

    comment = normalizedComment || null;
  }

  try {
    const { data: activity, error: activityError } = await getSupabaseAdmin()
      .from("activities")
      .select("status")
      .eq("id", activityId)
      .maybeSingle();

    if (activityError) {
      request.log.error(
        {
          err: activityError,
          activityId,
          userId: session.user.id,
        },
        "Unable to check activity before review",
      );

      response.status(500).json({
        error: "The review could not be saved.",
      });
      return;
    }

    if (!activity) {
      response.status(404).json({
        error: "Activity not found.",
        code: "activity_not_found",
      });
      return;
    }

    if (activity.status === "cancelled") {
      response.status(409).json({
        error: "Cancelled activities cannot be reviewed.",
        code: "activity_cancelled",
      });
      return;
    }

    if (activity.status !== "completed") {
      response.status(409).json({
        error: "The activity has not finished yet.",
        code: "activity_not_finished",
      });
      return;
    }

    const { data, error } = await getSupabaseAdmin().rpc(
      "upsert_activity_review_as_user",
      {
        p_activity_id: activityId,
        p_user_id: session.user.id,
        p_rating: rating,
        p_comment: comment,
      },
    );
    if (error) throw error;
    const result = activityReviewRpcRow(data);
    if (!result) throw new Error("Malformed activity review RPC response");
    const failures: Record<string, { status: number; code: string }> = {
      not_found: { status: 404, code: "activity_not_found" },
      cancelled: { status: 409, code: "activity_cancelled" },
      organizer_cannot_review: { status: 403, code: "organizer_cannot_review" },
      not_finished: { status: 409, code: "activity_not_finished" },
      not_participant: { status: 403, code: "not_activity_participant" },
      invalid_rating: { status: 400, code: "invalid_rating" },
      comment_too_long: { status: 400, code: "comment_too_long" },
    };
    const failure = failures[result.result];
    if (failure) {
      response.status(failure.status).json({
        error: "The review could not be saved.", code: failure.code,
      });
      return;
    }
    if (
      result.result !== "saved" || !result.review_id || !UUID_PATTERN.test(result.review_id) ||
      result.rating === null || !Number.isInteger(result.rating) ||
      result.rating < 1 || result.rating > 5 ||
      result.average_rating === null || result.average_rating < 1 || result.average_rating > 5 ||
      result.review_count === null || !Number.isInteger(result.review_count) || result.review_count < 1
    ) throw new Error("Unexpected activity review RPC response");
    response.status(200).json({
      review: { id: result.review_id, rating: result.rating, comment: result.comment },
      averageRating: result.average_rating,
      reviewCount: result.review_count,
    });
    return;
  } catch (error) {
    request.log.error(
      {
        err: error,
        activityId,
        userId: session.user.id,
      },
      "Unable to save activity review",
    );

    response.status(500).json({
      error: "The review could not be saved.",
    });
  }
});

router.put("/activities/:id", async (request, response) => {
  let session;

  try {
    session = await currentSession(request, response);
  } catch (error) {
    request.log.error({ err: error }, "Unable to authenticate activity editor");
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  if (!session) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  const activityId = request.params.id;

  if (!UUID_PATTERN.test(activityId)) {
    response.status(404).json({
      error: "Activity not found.",
      code: "activity_not_found",
    });
    return;
  }

  let activity: ValidatedActivity;

  try {
    activity = validateActivity(bodyOf(request));
  } catch {
    response.status(400).json({
      error: "Check the activity details and try again.",
      code: "invalid_activity",
    });
    return;
  }

  const now = new Date();
  const nowIso = now.toISOString();

  if (Date.parse(activity.starts_at) <= now.getTime()) {
    response.status(400).json({
      error: "The activity start time must be in the future.",
      code: "activity_start_in_past",
    });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: currentActivity, error: currentActivityError } =
      await supabase
        .from("activities")
        .select(
          "id,creator_id,status,starts_at,visibility,location_type,city,country_code,region_code,region_name,latitude,longitude",
        )
        .eq("id", activityId)
        .maybeSingle();

    if (currentActivityError) {
      request.log.error(
        {
          err: currentActivityError,
          activityId,
          userId: session.user.id,
        },
        "Unable to load activity before editing",
      );

      response.status(500).json({
        error: "The activity could not be updated.",
      });
      return;
    }

    if (!currentActivity) {
      response.status(404).json({
        error: "Activity not found.",
        code: "activity_not_found",
      });
      return;
    }

    if (currentActivity.creator_id !== session.user.id) {
      response.status(403).json({
        error: "Only the organizer can edit this activity.",
        code: "not_activity_organizer",
      });
      return;
    }

    if (currentActivity.status !== "active") {
      response.status(409).json({
        error: "This activity can no longer be edited.",
        code: "activity_not_active",
      });
      return;
    }

    if (Date.parse(currentActivity.starts_at) <= now.getTime()) {
      response.status(409).json({
        error: "Activities cannot be edited after they start.",
        code: "activity_started",
      });
      return;
    }

    const { count: memberCount, error: memberCountError } = await supabase
      .from("activity_members")
      .select("*", { count: "exact", head: true })
      .eq("activity_id", activityId);

    if (memberCountError) {
      request.log.error(
        {
          err: memberCountError,
          activityId,
          userId: session.user.id,
        },
        "Unable to count activity members before editing",
      );

      response.status(500).json({
        error: "The activity could not be updated.",
      });
      return;
    }

    if (
      activity.participation_mode === "limited" &&
      activity.max_participants !== null &&
      activity.max_participants < (memberCount ?? 0)
    ) {
      response.status(409).json({
        error:
          "The participant limit cannot be lower than the current member count.",
        code: "max_participants_below_members",
        memberCount: memberCount ?? 0,
      });
      return;
    }

    const shouldPreserveLocationMetadata =
      activity.location_type === "physical" &&
      currentActivity.location_type === "physical" &&
      activity.city === currentActivity.city;

    const activityUpdate = shouldPreserveLocationMetadata
      ? {
          ...activity,
          country_code: activity.country_code ?? currentActivity.country_code,
          region_code: activity.region_code ?? currentActivity.region_code,
          region_name: activity.region_name ?? currentActivity.region_name,
          latitude: activity.latitude ?? currentActivity.latitude,
          longitude: activity.longitude ?? currentActivity.longitude,
        }
      : activity;

    const { data: updatedActivity, error: updateError } = await supabase
      .from("activities")
      .update(activityUpdate)
      .eq("id", activityId)
      .eq("creator_id", session.user.id)
      .eq("status", "active")
      .gt("starts_at", nowIso)
      .select("id")
      .maybeSingle();

    if (updateError) {
      request.log.error(
        {
          err: updateError,
          activityId,
          userId: session.user.id,
        },
        "Unable to update activity",
      );

      response.status(500).json({
        error: "The activity could not be updated.",
      });
      return;
    }

    if (!updatedActivity) {
      response.status(409).json({
        error: "This activity can no longer be edited.",
        code: "activity_changed",
      });
      return;
    }

    if (
      currentActivity.visibility === "invite_only" &&
      activity.visibility !== "invite_only"
    ) {
      const { error: invitationCleanupError } = await supabase
        .from("activity_invitations")
        .delete()
        .eq("activity_id", activityId);

      if (invitationCleanupError) {
        request.log.error(
          {
            err: invitationCleanupError,
            activityId,
            userId: session.user.id,
          },
          "Unable to clean invitations after changing activity visibility",
        );
      }
    }

    response.json({
      activity: {
        id: updatedActivity.id,
      },
    });
  } catch (error) {
    request.log.error(
      {
        err: error,
        activityId,
        userId: session.user.id,
      },
      "Unable to update activity",
    );

    response.status(500).json({
      error: "The activity could not be updated.",
    });
  }
});

router.post("/activities/:id/complete", async (request, response) => {
  let session;

  try {
    session = await currentSession(request, response);
  } catch (error) {
    request.log.error(
      { err: error },
      "Unable to authenticate activity completion",
    );

    response.status(401).json({
      error: "Authentication required.",
    });
    return;
  }

  if (!session) {
    response.status(401).json({
      error: "Authentication required.",
    });
    return;
  }

  const activityId = request.params.id;

  if (!UUID_PATTERN.test(activityId)) {
    response.status(404).json({
      error: "Activity not found.",
      code: "activity_not_found",
    });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: activity, error: activityError } = await supabase
      .from("activities")
      .select("id,creator_id,status,starts_at")
      .eq("id", activityId)
      .maybeSingle();

    if (activityError) {
      request.log.error(
        {
          err: activityError,
          activityId,
          userId: session.user.id,
        },
        "Unable to load activity before completion",
      );

      response.status(500).json({
        error: "The activity could not be completed.",
      });
      return;
    }

    if (!activity) {
      response.status(404).json({
        error: "Activity not found.",
        code: "activity_not_found",
      });
      return;
    }

    if (activity.creator_id !== session.user.id) {
      response.status(403).json({
        error: "Only the organizer can complete this activity.",
        code: "not_activity_organizer",
      });
      return;
    }

    if (activity.status === "cancelled") {
      response.status(409).json({
        error: "Cancelled activities cannot be completed.",
        code: "activity_cancelled",
      });
      return;
    }

    if (activity.status === "completed") {
      response.json({
        result: "already_completed",
        activity: {
          id: activity.id,
          status: "completed",
        },
      });
      return;
    }

    const startsAt = Date.parse(activity.starts_at);

    if (!Number.isFinite(startsAt) || startsAt > Date.now()) {
      response.status(409).json({
        error: "The activity has not started yet.",
        code: "activity_not_started",
      });
      return;
    }

    const { data: completedActivity, error: completionError } = await supabase
      .from("activities")
      .update({
        status: "completed",
      })
      .eq("id", activity.id)
      .eq("creator_id", session.user.id)
      .eq("status", "active")
      .select("id,status")
      .maybeSingle();

    if (completionError) {
      request.log.error(
        {
          err: completionError,
          activityId,
          userId: session.user.id,
        },
        "Unable to complete activity",
      );

      response.status(500).json({
        error: "The activity could not be completed.",
      });
      return;
    }

    if (!completedActivity) {
      response.status(409).json({
        error: "This activity can no longer be completed.",
        code: "activity_changed",
      });
      return;
    }

    response.json({
      result: "completed",
      activity: {
        id: completedActivity.id,
        status: "completed",
      },
    });
  } catch (error) {
    request.log.error(
      {
        err: error,
        activityId,
        userId: session.user.id,
      },
      "Unable to complete activity",
    );

    response.status(500).json({
      error: "The activity could not be completed.",
    });
  }
});

router.post("/activities/:id/cancel", async (request, response) => {
  let session;

  try {
    session = await currentSession(request, response);
  } catch (error) {
    request.log.error(
      { err: error },
      "Unable to authenticate activity cancellation",
    );
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  if (!session) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  const activityId = request.params.id;

  if (!UUID_PATTERN.test(activityId)) {
    response.status(404).json({
      error: "Activity not found.",
      code: "activity_not_found",
    });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: activity, error: activityError } = await supabase
      .from("activities")
      .select("id,creator_id,status,starts_at,ends_at")
      .eq("id", activityId)
      .maybeSingle();

    if (activityError) {
      request.log.error(
        {
          err: activityError,
          activityId,
          userId: session.user.id,
        },
        "Unable to load activity before cancellation",
      );

      response.status(500).json({
        error: "The activity could not be cancelled.",
      });
      return;
    }

    if (!activity) {
      response.status(404).json({
        error: "Activity not found.",
        code: "activity_not_found",
      });
      return;
    }

    if (activity.creator_id !== session.user.id) {
      response.status(403).json({
        error: "Only the organizer can cancel this activity.",
        code: "not_activity_organizer",
      });
      return;
    }

    if (activity.status === "cancelled") {
      response.json({
        result: "already_cancelled",
        activity: {
          id: activity.id,
          status: "cancelled",
        },
      });
      return;
    }

    if (activity.status !== "active") {
      response.status(409).json({
        error: "This activity can no longer be cancelled.",
        code: "activity_not_active",
      });
      return;
    }

    const startsAt = Date.parse(activity.starts_at);

    if (Number.isFinite(startsAt) && startsAt <= Date.now()) {
      response.status(409).json({
        error: "Started activities cannot be cancelled.",
        code: "activity_started",
      });
      return;
    }

    const { data: cancelledActivity, error: cancellationError } = await supabase
      .from("activities")
      .update({ status: "cancelled" })
      .eq("id", activityId)
      .eq("creator_id", session.user.id)
      .eq("status", "active")
      .select("id,status")
      .maybeSingle();

    if (cancellationError) {
      request.log.error(
        {
          err: cancellationError,
          activityId,
          userId: session.user.id,
        },
        "Unable to cancel activity",
      );

      response.status(500).json({
        error: "The activity could not be cancelled.",
      });
      return;
    }

    if (!cancelledActivity) {
      response.status(409).json({
        error: "This activity can no longer be cancelled.",
        code: "activity_changed",
      });
      return;
    }

    response.json({
      result: "cancelled",
      activity: {
        id: cancelledActivity.id,
        status: cancelledActivity.status,
      },
    });
  } catch (error) {
    request.log.error(
      {
        err: error,
        activityId,
        userId: session.user.id,
      },
      "Unable to cancel activity",
    );

    response.status(500).json({
      error: "The activity could not be cancelled.",
    });
  }
});

router.get("/activities/user/:userId", async (request, response) => {
  let session;

  try {
    session = await currentSession(request, response);
  } catch (error) {
    request.log.error(
      { err: error },
      "Unable to authenticate public profile activity viewer",
    );

    response.status(401).json({
      error: "Authentication required.",
    });
    return;
  }

  if (!session) {
    response.status(401).json({
      error: "Authentication required.",
    });
    return;
  }

  const userId = request.params.userId;

  if (!UUID_PATTERN.test(userId)) {
    response.status(404).json({
      error: "User not found.",
      code: "user_not_found",
    });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,is_profile_private")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      request.log.error(
        {
          err: profileError,
          userId,
          viewerId: session.user.id,
        },
        "Unable to load profile before loading profile activities",
      );

      response.status(500).json({
        error: "The activities could not be loaded.",
      });
      return;
    }

    if (!profile) {
      response.status(404).json({
        error: "User not found.",
        code: "user_not_found",
      });
      return;
    }

    const isOwnProfile = userId === session.user.id;

    let isFriend = false;

    if (!isOwnProfile) {
      const connection = await findConnection(session.user.id, userId);

      isFriend = connection?.status === "accepted";
    }

    const canSeePrivateProfile =
      isOwnProfile || profile.is_profile_private !== true || isFriend;

    if (!canSeePrivateProfile) {
      response.json({
        activities: [],
        completedActivities: [],
        reputation: null,
      });
      return;
    }

    const canSeeFriendsOnly = isOwnProfile || isFriend;

    let query = supabase
      .from("activities")
      .select(
        "id,title,category,subcategory,starts_at,ends_at,timezone_name,location_type,city,online_platform,participation_mode,max_participants,status,visibility,activity_members(count)",
      )
      .eq("creator_id", userId)
      .eq("status", "active")
      .gt("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(12);

    if (canSeeFriendsOnly) {
      query = query.in("visibility", ["public", "friends"]);
    } else {
      query = query.eq("visibility", "public");
    }

    const { data: activities, error: activitiesError } = await query;

    if (activitiesError) {
      request.log.error(
        {
          err: activitiesError,
          userId,
          viewerId: session.user.id,
        },
        "Unable to load public profile activities",
      );

      response.status(500).json({
        error: "The activities could not be loaded.",
      });
      return;
    }

    let completedPlansQuery = supabase
      .from("activities")
      .select(
        "id,title,category,subcategory,starts_at,ends_at,timezone_name,location_type,city,online_platform,participation_mode,max_participants,status,visibility,activity_members(count)",
      )
      .eq("creator_id", userId)
      .eq("status", "completed")
      .order("starts_at", { ascending: false })
      .limit(6);

    if (canSeeFriendsOnly) {
      completedPlansQuery = completedPlansQuery.in("visibility", [
        "public",
        "friends",
      ]);
    } else {
      completedPlansQuery = completedPlansQuery.eq(
        "visibility",
        "public",
      );
    }

    const {
      data: completedPlans,
      error: completedPlansError,
    } = await completedPlansQuery;

    if (completedPlansError) {
      request.log.error(
        {
          err: completedPlansError,
          userId,
          viewerId: session.user.id,
        },
        "Unable to load completed profile activities",
      );

      response.status(500).json({
        error: "The completed activities could not be loaded.",
      });

      return;
    }

    const { data: completedCandidates, error: completedActivitiesError } =
      await supabase
        .from("activities")
        .select("id,title,status")
        .eq("creator_id", userId)
        .eq("status", "completed");

    if (completedActivitiesError) {
      request.log.error(
        {
          err: completedActivitiesError,
          userId,
          viewerId: session.user.id,
        },
        "Unable to load completed activities for reputation",
      );

      response.status(500).json({
        error: "The reputation could not be loaded.",
      });
      return;
    }

    const completedActivityIds = (completedCandidates ?? []).map(
      (activity) => activity.id,
    );

    const completedActivityTitleById = new Map(
      (completedCandidates ?? []).map((activity) => [
        activity.id,
        activity.title,
      ]),
    );

    let averageRating: number | null = null;
    let reviewCount = 0;

    const ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    let recentReviews: Array<{
      rating: number;
      comment: string;
      createdAt: string;
      activityId: string;
      activityTitle: string;
      reviewerId: string;
      reviewerUsername: string | null;
    }> = [];

    if (completedActivityIds.length > 0) {
      const { data: reviews, error: reviewsError } = await supabase
        .from("activity_reviews")
        .select("activity_id,reviewer_id,rating,comment,created_at")
        .in("activity_id", completedActivityIds)
        .order("created_at", {
          ascending: false,
        });

      if (reviewsError) {
        request.log.error(
          {
            err: reviewsError,
            userId,
            viewerId: session.user.id,
          },
          "Unable to load reviews for reputation",
        );

        response.status(500).json({
          error: "The reputation could not be loaded.",
        });
        return;
      }

      reviewCount = reviews?.length ?? 0;

      for (const review of reviews ?? []) {
        switch (review.rating) {
          case 1:
            ratingDistribution[1] += 1;
            break;
          case 2:
            ratingDistribution[2] += 1;
            break;
          case 3:
            ratingDistribution[3] += 1;
            break;
          case 4:
            ratingDistribution[4] += 1;
            break;
          case 5:
            ratingDistribution[5] += 1;
            break;
        }
      }

      if (reviewCount > 0) {
        const ratingSum = reviews!.reduce(
          (sum, review) => sum + review.rating,
          0,
        );

        averageRating = Number((ratingSum / reviewCount).toFixed(1));
      }
      const reviewsWithComments = (reviews ?? [])
        .filter(
          (review) =>
            typeof review.comment === "string" &&
            review.comment.trim().length > 0,
        )
        .slice(0, 3);

      const reviewerIds = [
        ...new Set(reviewsWithComments.map((review) => review.reviewer_id)),
      ];

      let reviewerUsernameById = new Map<string, string>();

      if (reviewerIds.length > 0) {
        const { data: reviewerProfiles, error: reviewerProfilesError } =
          await supabase
            .from("profiles")
            .select("id,username")
            .in("id", reviewerIds);

        if (reviewerProfilesError) {
          request.log.error(
            {
              err: reviewerProfilesError,
              userId,
              viewerId: session.user.id,
            },
            "Unable to load review authors for reputation",
          );

          response.status(500).json({
            error: "The reputation could not be loaded.",
          });
          return;
        }

        reviewerUsernameById = new Map(
          (reviewerProfiles ?? []).map((profile) => [
            profile.id,
            profile.username,
          ]),
        );
      }

      recentReviews = reviewsWithComments.map((review) => ({
        rating: review.rating,
        comment: review.comment!.trim(),
        createdAt: review.created_at,
        activityId: review.activity_id,
        activityTitle: completedActivityTitleById.get(review.activity_id) ?? "",
        reviewerId: review.reviewer_id,
        reviewerUsername: reviewerUsernameById.get(review.reviewer_id) ?? null,
      }));
    }

    const reputation = {
      averageRating,
      reviewCount,
      completedActivityCount: completedActivityIds.length,
      ratingDistribution,
      recentReviews,
    };

    response.json({
      reputation,

      activities: (activities ?? []).map((activity) => ({
        id: activity.id,
        title: activity.title,
        category: activity.category,
        subcategory: activity.subcategory,
        startsAt: activity.starts_at,
        endsAt: activity.ends_at,
        timezoneName: activity.timezone_name,
        locationType: activity.location_type,
        city: activity.city,
        onlinePlatform: activity.online_platform,
        participationMode: activity.participation_mode,
        maxParticipants: activity.max_participants,
        memberCount: activity.activity_members?.[0]?.count ?? 0,
        status: activity.status,
        visibility: activity.visibility,
      })),

      completedActivities: (completedPlans ?? []).map(
        (activity) => ({
          id: activity.id,
          title: activity.title,
          category: activity.category,
          subcategory: activity.subcategory,
          startsAt: activity.starts_at,
          endsAt: activity.ends_at,
          timezoneName: activity.timezone_name,
          locationType: activity.location_type,
          city: activity.city,
          onlinePlatform: activity.online_platform,
          participationMode: activity.participation_mode,
          maxParticipants: activity.max_participants,
          memberCount:
            activity.activity_members?.[0]?.count ?? 0,
          status: activity.status,
          visibility: activity.visibility,
        }),
      ),
    });
  } catch (error) {
    request.log.error(
      {
        err: error,
        userId,
        viewerId: session.user.id,
      },
      "Unable to load profile activities",
    );

    response.status(500).json({
      error: "The activities could not be loaded.",
    });
  }
});

router.get("/activities/:id", async (request, response) => {
  let session;
  try {
    session = await currentSession(request, response);
  } catch (error) {
    request.log.error({ err: error }, "Unable to authenticate activity viewer");
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  if (!session) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  const activityId = request.params.id;
  if (!UUID_PATTERN.test(activityId)) {
    response.status(404).json({ error: "Activity not found." });
    return;
  }

  try {
    const { data: activity, error: activityError } = await getSupabaseAdmin()
      .from("activities")
      .select(
        "id,creator_id,title,description,category,subcategory,starts_at,ends_at,timezone_name,location_type,country_code,region_code,region_name,city,meeting_point,online_platform,participation_mode,max_participants,cost_type,estimated_cost,currency,status,visibility",
      )
      .eq("id", activityId)
      .maybeSingle();

    if (activityError) {
      request.log.error(
        { err: activityError, activityId, userId: session.user.id },
        "Unable to load activity",
      );
      response.status(500).json({ error: "The activity could not be loaded." });
      return;
    }

    if (!activity) {
      response.status(404).json({ error: "Activity not found." });
      return;
    }

    if (
      activity.visibility === "friends" &&
      activity.creator_id !== session.user.id
    ) {
      const { data: existingMembership, error: existingMembershipError } =
        await getSupabaseAdmin()
          .from("activity_members")
          .select("role")
          .eq("activity_id", activity.id)
          .eq("user_id", session.user.id)
          .maybeSingle();

      if (existingMembershipError) {
        request.log.error(
          {
            err: existingMembershipError,
            activityId,
            userId: session.user.id,
          },
          "Unable to check friends-only activity membership",
        );

        response.status(500).json({
          error: "The activity could not be loaded.",
        });
        return;
      }

      if (!existingMembership) {
        const connection = await findConnection(
          session.user.id,
          activity.creator_id,
        );

        if (connection?.status !== "accepted") {
          response.status(404).json({
            error: "Activity not found.",
          });
          return;
        }
      }
    }

    if (
      activity.visibility === "invite_only" &&
      activity.creator_id !== session.user.id
    ) {
      const supabase = getSupabaseAdmin();

      const [membershipResult, invitationResult] = await Promise.all([
        supabase
          .from("activity_members")
          .select("role")
          .eq("activity_id", activity.id)
          .eq("user_id", session.user.id)
          .maybeSingle(),

        supabase
          .from("activity_invitations")
          .select("id,status")
          .eq("activity_id", activity.id)
          .eq("invitee_id", session.user.id)
          .eq("status", "pending")
          .maybeSingle(),
      ]);

      if (membershipResult.error || invitationResult.error) {
        request.log.error(
          {
            membershipError: membershipResult.error,
            invitationError: invitationResult.error,
            activityId,
            userId: session.user.id,
          },
          "Unable to check invite-only activity access",
        );

        response.status(500).json({
          error: "The activity could not be loaded.",
        });
        return;
      }

      if (!membershipResult.data && !invitationResult.data) {
        response.status(404).json({
          error: "Activity not found.",
        });
        return;
      }
    }

    const [
      profileResult,
      memberResult,
      membershipResult,
      memberListResult,
      reviewsResult,
    ] = await Promise.all([
      getSupabaseAdmin()
        .from("profiles")
        .select("username,display_name,display_name_visibility")
        .eq("id", activity.creator_id)
        .maybeSingle(),

      getSupabaseAdmin()
        .from("activity_members")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq("activity_id", activity.id),

      getSupabaseAdmin()
        .from("activity_members")
        .select("role")
        .eq("activity_id", activity.id)
        .eq("user_id", session.user.id)
        .maybeSingle(),

      getSupabaseAdmin()
        .from("activity_members")
        .select("user_id,role,joined_at")
        .eq("activity_id", activity.id)
        .order("joined_at", {
          ascending: true,
        }),
      getSupabaseAdmin()
        .from("activity_reviews")
        .select("reviewer_id,rating,comment,created_at")
        .eq("activity_id", activity.id)
        .order("created_at", {
          ascending: false,
        }),
    ]);

    if (
      profileResult.error ||
      memberResult.error ||
      membershipResult.error ||
      memberListResult.error ||
      reviewsResult.error
    ) {
      request.log.error(
        {
          profileError: profileResult.error,
          memberError: memberResult.error,
          membershipError: membershipResult.error,
          memberListError: memberListResult.error,
          reviewError: reviewsResult.error,
          activityId,
        },
        "Unable to load activity details",
      );
      response.status(500).json({ error: "The activity could not be loaded." });
      return;
    }

    if (
      activity.status !== "active" &&
      activity.creator_id !== session.user.id &&
      !membershipResult.data
    ) {
      response.status(404).json({ error: "Activity not found." });
      return;
    }

    const memberRows = [...(memberListResult.data ?? [])].sort(
      (left, right) => {
        if (left.role !== right.role) {
          return left.role === "organizer" ? -1 : 1;
        }

        return Date.parse(left.joined_at) - Date.parse(right.joined_at);
      },
    );

    const memberIds = [
      ...new Set(
        memberRows
          .map((member) => member.user_id)
          .filter((userId): userId is string => typeof userId === "string"),
      ),
    ];

    let memberProfiles: Array<{
      id: string;
      username: string;
      display_name: string | null;
      display_name_visibility: string | null;
      avatar_path: string | null;
    }> = [];

    if (memberIds.length > 0) {
      const { data: profiles, error: profilesError } = await getSupabaseAdmin()
        .from("profiles")
        .select("id,username,display_name,display_name_visibility,avatar_path")
        .in("id", memberIds);

      if (profilesError) {
        request.log.error(
          {
            err: profilesError,
            activityId,
          },
          "Unable to load activity member profiles",
        );

        response.status(500).json({
          error: "The activity could not be loaded.",
        });
        return;
      }

      memberProfiles = (profiles ?? []) as typeof memberProfiles;
    }

    const profileById = new Map(
      memberProfiles.map((profile) => [profile.id, profile]),
    );

    const viewerSharesActivity = Boolean(membershipResult.data);

    const members = await Promise.all(
      memberRows.map(async (member) => {
        const profile = profileById.get(member.user_id);

        const visibility =
          profile?.display_name_visibility ?? "shared_activity";

        const displayNameVisible =
          member.user_id === session.user.id ||
          visibility === "everyone" ||
          (visibility === "shared_activity" && viewerSharesActivity);

        let avatarUrl: string | null = null;

        const canonicalAvatarPath = `${member.user_id}/avatar.webp`;

        if (profile?.avatar_path === canonicalAvatarPath) {
          const { data: signedAvatar, error: signedAvatarError } =
            await getSupabaseAdmin()
              .storage.from(AVATAR_BUCKET)
              .createSignedUrl(canonicalAvatarPath, AVATAR_SIGNED_URL_SECONDS);

          if (signedAvatarError) {
            request.log.warn(
              {
                err: signedAvatarError,
                userId: member.user_id,
                activityId,
              },
              "Unable to sign activity member avatar",
            );
          } else {
            avatarUrl = signedAvatar?.signedUrl ?? null;
          }
        }

        return {
          id: member.user_id,
          username: profile?.username ?? null,
          displayName:
            displayNameVisible && profile?.display_name?.trim()
              ? profile.display_name.trim()
              : null,
          avatarUrl,
          role: member.role === "organizer" ? "organizer" : "participant",
        };
      }),
    );

    const memberById = new Map(members.map((member) => [member.id, member]));

    const reviewRows = reviewsResult.data ?? [];
    const ownReview = reviewRows.find((review) => review.reviewer_id === session.user.id);

    const reviewCount = reviewRows.length;

    const averageRating =
      reviewCount > 0
        ? Number(
            (
              reviewRows.reduce((sum, review) => sum + review.rating, 0) /
              reviewCount
            ).toFixed(2),
          )
        : null;

    const reviews = reviewRows.map((review) => {
      const reviewer = memberById.get(review.reviewer_id);

      return {
        reviewer: {
          id: review.reviewer_id,
          username: reviewer?.username ?? null,
          displayName: reviewer?.displayName ?? null,
          avatarUrl: reviewer?.avatarUrl ?? null,
        },
        rating: review.rating,
        comment: review.comment,
        createdAt: review.created_at,
      };
    });

    const organizerVisibility =
      profileResult.data?.display_name_visibility ?? "shared_activity";

    const organizerDisplayNameVisible =
      activity.creator_id === session.user.id ||
      organizerVisibility === "everyone" ||
      (organizerVisibility === "shared_activity" && viewerSharesActivity);

    response.json({
      activity: {
        id: activity.id,
        title: activity.title,
        description: activity.description,
        category: activity.category,
        subcategory: activity.subcategory,
        startsAt: activity.starts_at,
        endsAt: activity.ends_at,
        timezoneName: activity.timezone_name,
        locationType: activity.location_type,
        countryCode: activity.country_code,
        regionCode: activity.region_code,
        regionName: activity.region_name,
        city: activity.city,
        meetingPoint: activity.meeting_point,
        onlinePlatform: activity.online_platform,
        participationMode: activity.participation_mode,
        maxParticipants: activity.max_participants,
        costType: activity.cost_type,
        estimatedCost: activity.estimated_cost,
        currency: activity.currency,
        status: activity.status,
        visibility: activity.visibility,
        organizer: {
          username: profileResult.data?.username ?? null,

          displayName:
            organizerDisplayNameVisible &&
            profileResult.data?.display_name?.trim()
              ? profileResult.data.display_name.trim()
              : null,
        },
        memberCount: memberResult.count ?? 0,
        members,
        averageRating,
        reviewCount,
        reviews,
        canReview: activity.status === "completed" &&
          activity.creator_id !== session.user.id &&
          membershipResult.data?.role === "participant",
        myReview: ownReview ? { rating: ownReview.rating, comment: ownReview.comment } : null,
        membershipRole:
          membershipResult.data?.role === "organizer" ||
          membershipResult.data?.role === "participant"
            ? membershipResult.data.role
            : null,
      },
    });
  } catch (error) {
    request.log.error(
      { err: error, activityId, userId: session.user.id },
      "Unable to load activity",
    );
    response.status(500).json({ error: "The activity could not be loaded." });
  }
});

router.post("/activities/:id/invitations", async (request, response) => {
  let session;

  try {
    session = await currentSession(request, response);
  } catch (error) {
    request.log.error(
      { err: error },
      "Unable to authenticate activity invitation",
    );

    response.status(401).json({
      error: "Authentication required.",
    });
    return;
  }

  if (!session) {
    response.status(401).json({
      error: "Authentication required.",
    });
    return;
  }

  const activityId = request.params.id;

  if (!UUID_PATTERN.test(activityId)) {
    response.status(404).json({
      error: "Activity not found.",
      code: "activity_not_found",
    });
    return;
  }

  const inviteeId =
    request.body &&
    typeof request.body === "object" &&
    typeof request.body.inviteeId === "string"
      ? request.body.inviteeId
      : "";

  if (!UUID_PATTERN.test(inviteeId)) {
    response.status(400).json({
      error: "The invited user is invalid.",
      code: "invalid_invitee",
    });
    return;
  }

  if (inviteeId === session.user.id) {
    response.status(400).json({
      error: "You cannot invite yourself.",
      code: "cannot_invite_self",
    });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: activity, error: activityError } = await supabase
      .from("activities")
      .select(
        "id,creator_id,status,starts_at,visibility,participation_mode,max_participants",
      )
      .eq("id", activityId)
      .maybeSingle();

    if (activityError) {
      request.log.error(
        {
          err: activityError,
          activityId,
          userId: session.user.id,
        },
        "Unable to load activity before invitation",
      );

      response.status(500).json({
        error: "The invitation could not be sent.",
      });
      return;
    }

    if (!activity) {
      response.status(404).json({
        error: "Activity not found.",
        code: "activity_not_found",
      });
      return;
    }

    if (activity.creator_id !== session.user.id) {
      response.status(403).json({
        error: "Only the organizer can invite people.",
        code: "not_activity_organizer",
      });
      return;
    }

    if (activity.visibility !== "invite_only") {
      response.status(409).json({
        error: "This activity does not use invitations.",
        code: "activity_not_invite_only",
      });
      return;
    }

    if (activity.status !== "active") {
      response.status(409).json({
        error: "This activity is no longer active.",
        code: "activity_not_active",
      });
      return;
    }

    const startsAt = Date.parse(activity.starts_at);

    if (Number.isFinite(startsAt) && startsAt <= Date.now()) {
      response.status(409).json({
        error: "Invitations cannot be sent after the activity starts.",
        code: "activity_started",
      });
      return;
    }

    const connection = await findConnection(session.user.id, inviteeId);

    if (connection?.status !== "accepted") {
      response.status(403).json({
        error: "Only friends can be invited.",
        code: "invitee_not_friend",
      });
      return;
    }

    const { data: existingMember, error: memberError } = await supabase
      .from("activity_members")
      .select("role")
      .eq("activity_id", activityId)
      .eq("user_id", inviteeId)
      .maybeSingle();

    if (memberError) {
      request.log.error(
        {
          err: memberError,
          activityId,
          inviteeId,
        },
        "Unable to check activity member before invitation",
      );

      response.status(500).json({
        error: "The invitation could not be sent.",
      });
      return;
    }

    if (existingMember) {
      response.status(409).json({
        error: "This user is already participating.",
        code: "already_member",
      });
      return;
    }

    if (
      activity.participation_mode === "limited" &&
      activity.max_participants !== null
    ) {
      const { count: memberCount, error: memberCountError } = await supabase
        .from("activity_members")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq("activity_id", activityId);

      if (memberCountError) {
        request.log.error(
          {
            err: memberCountError,
            activityId,
          },
          "Unable to count activity members before invitation",
        );

        response.status(500).json({
          error: "The invitation could not be sent.",
        });
        return;
      }

      if ((memberCount ?? 0) >= activity.max_participants) {
        response.status(409).json({
          error: "The activity is full.",
          code: "activity_full",
        });
        return;
      }
    }

    const { data: existingInvitation, error: invitationError } = await supabase
      .from("activity_invitations")
      .select("id,status,updated_at")
      .eq("activity_id", activityId)
      .eq("invitee_id", inviteeId)
      .maybeSingle();

    if (invitationError) {
      request.log.error(
        {
          err: invitationError,
          activityId,
          inviteeId,
        },
        "Unable to check existing activity invitation",
      );

      response.status(500).json({
        error: "The invitation could not be sent.",
      });
      return;
    }

    if (existingInvitation?.status === "pending") {
      response.json({
        result: "already_pending",
        invitation: {
          id: existingInvitation.id,
          status: "pending",
        },
      });
      return;
    }

    if (existingInvitation?.status === "accepted") {
      response.status(409).json({
        error: "This invitation has already been accepted.",
        code: "invitation_already_accepted",
      });
      return;
    }

    if (existingInvitation?.status === "declined") {
      const { data: renewedInvitation, error: renewError } = await supabase
        .from("activity_invitations")
        .update({
          status: "pending",
          responded_at: null,
        })
        .eq("id", existingInvitation.id)
        .eq("status", "declined")
        .select("id,status,updated_at")
        .maybeSingle();

      if (renewError) {
        request.log.error(
          {
            err: renewError,
            activityId,
            inviteeId,
          },
          "Unable to renew activity invitation",
        );

        response.status(500).json({
          error: "The invitation could not be sent.",
        });
        return;
      }

      if (!renewedInvitation) {
        response.status(409).json({ error: "The invitation has changed.", code: "invitation_changed" });
        return;
      }
      await createNotification({
        recipientId: inviteeId, actorId: session.user.id, activityId,
        type: "activity_invitation", metadata: { invitationId: renewedInvitation.id },
        dedupeKey: `activity_invitation:${renewedInvitation.id}:${renewedInvitation.updated_at}`,
      });
      response.json({
        result: "invited",
        invitation: {
          id: renewedInvitation.id,
          status: renewedInvitation.status,
        },
      });
      return;
    }

    const { data: invitation, error: createError } = await supabase
      .from("activity_invitations")
      .insert({
        activity_id: activityId,
        invitee_id: inviteeId,
      })
      .select("id,status,updated_at")
      .single();

    if (createError) {
      request.log.error(
        {
          err: createError,
          activityId,
          inviteeId,
        },
        "Unable to create activity invitation",
      );

      response.status(500).json({
        error: "The invitation could not be sent.",
      });
      return;
    }

    await createNotification({
      recipientId: inviteeId, actorId: session.user.id, activityId,
      type: "activity_invitation", metadata: { invitationId: invitation.id },
      dedupeKey: `activity_invitation:${invitation.id}:${invitation.updated_at}`,
    });
    response.status(201).json({
      result: "invited",
      invitation: {
        id: invitation.id,
        status: invitation.status,
      },
    });
  } catch (error) {
    request.log.error(
      {
        err: error,
        activityId,
        inviteeId,
        userId: session.user.id,
      },
      "Unable to send activity invitation",
    );

    response.status(500).json({
      error: "The invitation could not be sent.",
    });
  }
});

router.get("/activities/:id/invitations", async (request, response) => {
  let session;

  try {
    session = await currentSession(request, response);
  } catch (error) {
    request.log.error(
      { err: error },
      "Unable to authenticate activity invitation list",
    );

    response.status(401).json({
      error: "Authentication required.",
    });
    return;
  }

  if (!session) {
    response.status(401).json({
      error: "Authentication required.",
    });
    return;
  }

  const activityId = request.params.id;

  if (!UUID_PATTERN.test(activityId)) {
    response.status(404).json({
      error: "Activity not found.",
      code: "activity_not_found",
    });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: activity, error: activityError } = await supabase
      .from("activities")
      .select("id,creator_id,visibility")
      .eq("id", activityId)
      .maybeSingle();

    if (activityError) {
      request.log.error(
        {
          err: activityError,
          activityId,
          userId: session.user.id,
        },
        "Unable to load activity before listing invitations",
      );

      response.status(500).json({
        error: "The invitations could not be loaded.",
      });
      return;
    }

    if (!activity) {
      response.status(404).json({
        error: "Activity not found.",
        code: "activity_not_found",
      });
      return;
    }

    if (activity.creator_id !== session.user.id) {
      response.status(403).json({
        error: "Only the organizer can view invitations.",
        code: "not_activity_organizer",
      });
      return;
    }

    if (activity.visibility !== "invite_only") {
      response.json({
        invitations: [],
      });
      return;
    }

    const { data: invitationRows, error: invitationsError } = await supabase
      .from("activity_invitations")
      .select("id,invitee_id,status,created_at,updated_at,responded_at")
      .eq("activity_id", activityId)
      .order("created_at", {
        ascending: false,
      });

    if (invitationsError) {
      request.log.error(
        {
          err: invitationsError,
          activityId,
          userId: session.user.id,
        },
        "Unable to load activity invitations",
      );

      response.status(500).json({
        error: "The invitations could not be loaded.",
      });
      return;
    }

    if (!invitationRows?.length) {
      response.json({
        invitations: [],
      });
      return;
    }

    const inviteeIds = [
      ...new Set(
        invitationRows
          .map((invitation) => invitation.invitee_id)
          .filter(
            (inviteeId): inviteeId is string => typeof inviteeId === "string",
          ),
      ),
    ];

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id,username,display_name,display_name_visibility")
      .in("id", inviteeIds);

    if (profilesError) {
      request.log.error(
        {
          err: profilesError,
          activityId,
        },
        "Unable to load invited user profiles",
      );

      response.status(500).json({
        error: "The invitations could not be loaded.",
      });
      return;
    }

    const profileById = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile]),
    );

    const invitations = invitationRows.map((invitation) => {
      const profile = profileById.get(invitation.invitee_id);

      const displayNameVisible =
        profile?.display_name_visibility === "everyone" ||
        profile?.display_name_visibility === "friends";

      return {
        id: invitation.id,
        status: invitation.status,
        createdAt: invitation.created_at,
        respondedAt: invitation.responded_at,

        invitee: {
          id: invitation.invitee_id,
          username: profile?.username ?? null,
          displayName:
            displayNameVisible && profile?.display_name?.trim()
              ? profile.display_name.trim()
              : null,
        },
      };
    });

    response.json({
      invitations,
    });
  } catch (error) {
    request.log.error(
      {
        err: error,
        activityId,
        userId: session.user.id,
      },
      "Unable to load activity invitations",
    );

    response.status(500).json({
      error: "The invitations could not be loaded.",
    });
  }
});

router.delete(
  "/activities/:id/invitations/:invitationId",
  async (request, response) => {
    let session;

    try {
      session = await currentSession(request, response);
    } catch (error) {
      request.log.error(
        { err: error },
        "Unable to authenticate activity invitation cancellation",
      );

      response.status(401).json({
        error: "Authentication required.",
      });
      return;
    }

    if (!session) {
      response.status(401).json({
        error: "Authentication required.",
      });
      return;
    }

    const activityId = request.params.id;
    const invitationId = request.params.invitationId;

    if (!UUID_PATTERN.test(activityId) || !UUID_PATTERN.test(invitationId)) {
      response.status(404).json({
        error: "Invitation not found.",
        code: "invitation_not_found",
      });
      return;
    }

    try {
      const supabase = getSupabaseAdmin();

      const { data: activity, error: activityError } = await supabase
        .from("activities")
        .select("id,creator_id")
        .eq("id", activityId)
        .maybeSingle();

      if (activityError) {
        request.log.error(
          {
            err: activityError,
            activityId,
            invitationId,
          },
          "Unable to load activity before cancelling invitation",
        );

        response.status(500).json({
          error: "The invitation could not be cancelled.",
        });
        return;
      }

      if (!activity) {
        response.status(404).json({
          error: "Activity not found.",
          code: "activity_not_found",
        });
        return;
      }

      if (activity.creator_id !== session.user.id) {
        response.status(403).json({
          error: "Only the organizer can cancel invitations.",
          code: "not_activity_organizer",
        });
        return;
      }

      const { data: invitation, error: invitationError } = await supabase
        .from("activity_invitations")
        .select("id,status")
        .eq("id", invitationId)
        .eq("activity_id", activityId)
        .maybeSingle();

      if (invitationError) {
        request.log.error(
          {
            err: invitationError,
            activityId,
            invitationId,
          },
          "Unable to load invitation before cancellation",
        );

        response.status(500).json({
          error: "The invitation could not be cancelled.",
        });
        return;
      }

      if (!invitation) {
        response.status(404).json({
          error: "Invitation not found.",
          code: "invitation_not_found",
        });
        return;
      }

      if (invitation.status !== "pending") {
        response.status(409).json({
          error: "Only pending invitations can be cancelled.",
          code: "invitation_not_pending",
        });
        return;
      }

      const { error: deleteError } = await supabase
        .from("activity_invitations")
        .delete()
        .eq("id", invitationId)
        .eq("activity_id", activityId)
        .eq("status", "pending");

      if (deleteError) {
        request.log.error(
          {
            err: deleteError,
            activityId,
            invitationId,
          },
          "Unable to cancel activity invitation",
        );

        response.status(500).json({
          error: "The invitation could not be cancelled.",
        });
        return;
      }

      response.json({
        result: "cancelled",
      });
    } catch (error) {
      request.log.error(
        {
          err: error,
          activityId,
          invitationId,
          userId: session.user.id,
        },
        "Unable to cancel activity invitation",
      );

      response.status(500).json({
        error: "The invitation could not be cancelled.",
      });
    }
  },
);

router.get("/activities/invitations/pending", async (request, response) => {
  let session;

  try {
    session = await currentSession(request, response);
  } catch (error) {
    request.log.error(
      { err: error },
      "Unable to authenticate activity invitations viewer",
    );

    response.status(401).json({
      error: "Authentication required.",
    });
    return;
  }

  if (!session) {
    response.status(401).json({
      error: "Authentication required.",
    });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: invitationRows, error: invitationsError } = await supabase
      .from("activity_invitations")
      .select("id,activity_id,created_at")
      .eq("invitee_id", session.user.id)
      .eq("status", "pending")
      .order("created_at", {
        ascending: false,
      })
      .limit(50);

    if (invitationsError) {
      request.log.error(
        {
          err: invitationsError,
          userId: session.user.id,
        },
        "Unable to load pending activity invitations",
      );

      response.status(500).json({
        error: "The invitations could not be loaded.",
      });
      return;
    }

    if (!invitationRows?.length) {
      response.json({
        invitations: [],
      });
      return;
    }

    const activityIds = [
      ...new Set(
        invitationRows
          .map((invitation) => invitation.activity_id)
          .filter(
            (activityId): activityId is string =>
              typeof activityId === "string",
          ),
      ),
    ];

    const { data: activities, error: activitiesError } = await supabase
      .from("activities")
      .select(
        "id,creator_id,title,category,subcategory,starts_at,ends_at,timezone_name,location_type,city,online_platform,participation_mode,max_participants,status,visibility,activity_members(count)",
      )
      .in("id", activityIds)
      .eq("status", "active")
      .eq("visibility", "invite_only")
      .gt("starts_at", new Date().toISOString());

    if (activitiesError) {
      request.log.error(
        {
          err: activitiesError,
          userId: session.user.id,
        },
        "Unable to load activities for pending invitations",
      );

      response.status(500).json({
        error: "The invitations could not be loaded.",
      });
      return;
    }

    if (!activities?.length) {
      response.json({
        invitations: [],
      });
      return;
    }

    const activityById = new Map(
      activities.map((activity) => [activity.id, activity]),
    );

    const organizerIds = [
      ...new Set(
        activities
          .map((activity) => activity.creator_id)
          .filter(
            (organizerId): organizerId is string =>
              typeof organizerId === "string",
          ),
      ),
    ];

    const { data: organizerProfiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id,username,display_name,display_name_visibility")
      .in("id", organizerIds);

    if (profilesError) {
      request.log.error(
        {
          err: profilesError,
          userId: session.user.id,
        },
        "Unable to load organizers for pending invitations",
      );

      response.status(500).json({
        error: "The invitations could not be loaded.",
      });
      return;
    }

    const profileById = new Map(
      (organizerProfiles ?? []).map((profile) => [profile.id, profile]),
    );

    const invitations = invitationRows.flatMap((invitation) => {
      const activity = activityById.get(invitation.activity_id);

      if (!activity) {
        return [];
      }

      const organizer = profileById.get(activity.creator_id);

      const displayNameVisible =
        organizer?.display_name_visibility === "everyone" ||
        organizer?.display_name_visibility === "friends";

      return [
        {
          id: invitation.id,
          createdAt: invitation.created_at,

          organizer: {
            id: activity.creator_id,
            username: organizer?.username ?? null,
            displayName:
              displayNameVisible && organizer?.display_name?.trim()
                ? organizer.display_name.trim()
                : null,
          },

          activity: {
            id: activity.id,
            title: activity.title,
            category: activity.category,
            subcategory: activity.subcategory,
            startsAt: activity.starts_at,
            endsAt: activity.ends_at,
            timezoneName: activity.timezone_name,
            locationType: activity.location_type,
            city: activity.city,
            onlinePlatform: activity.online_platform,
            participationMode: activity.participation_mode,
            maxParticipants: activity.max_participants,
            memberCount: activity.activity_members?.[0]?.count ?? 0,
          },
        },
      ];
    });

    response.json({
      invitations,
    });
  } catch (error) {
    request.log.error(
      {
        err: error,
        userId: session.user.id,
      },
      "Unable to load pending activity invitations",
    );

    response.status(500).json({
      error: "The invitations could not be loaded.",
    });
  }
});

router.post(
  "/activities/invitations/:invitationId/accept",
  async (request, response) => {
    let session;

    try {
      session = await currentSession(request, response);
    } catch (error) {
      request.log.error(
        { err: error },
        "Unable to authenticate activity invitation acceptance",
      );

      response.status(401).json({
        error: "Authentication required.",
      });
      return;
    }

    if (!session) {
      response.status(401).json({
        error: "Authentication required.",
      });
      return;
    }

    const invitationId = request.params.invitationId;

    if (!UUID_PATTERN.test(invitationId)) {
      response.status(404).json({
        error: "Invitation not found.",
        code: "invitation_not_found",
      });
      return;
    }

    try {
      const supabase = getSupabaseAdmin();

      const { data: invitation, error: invitationError } = await supabase
        .from("activity_invitations")
        .select("id,activity_id,invitee_id,status,updated_at")
        .eq("id", invitationId)
        .eq("invitee_id", session.user.id)
        .maybeSingle();

      if (invitationError) {
        request.log.error(
          {
            err: invitationError,
            invitationId,
            userId: session.user.id,
          },
          "Unable to load activity invitation",
        );

        response.status(500).json({
          error: "The invitation could not be accepted.",
        });
        return;
      }

      if (!invitation) {
        response.status(404).json({
          error: "Invitation not found.",
          code: "invitation_not_found",
        });
        return;
      }

      if (invitation.status === "accepted") {
        response.json({
          result: "already_accepted",
          activityId: invitation.activity_id,
        });
        return;
      }

      if (invitation.status === "declined") {
        response.status(409).json({
          error: "This invitation was declined.",
          code: "invitation_declined",
        });
        return;
      }

      const { data: activity, error: activityError } = await supabase
        .from("activities")
        .select("id,visibility")
        .eq("id", invitation.activity_id)
        .maybeSingle();

      if (activityError) {
        request.log.error(
          {
            err: activityError,
            invitationId,
            activityId: invitation.activity_id,
          },
          "Unable to load activity before accepting invitation",
        );

        response.status(500).json({
          error: "The invitation could not be accepted.",
        });
        return;
      }

      if (!activity) {
        response.status(404).json({
          error: "Activity not found.",
          code: "activity_not_found",
        });
        return;
      }

      if (activity.visibility !== "invite_only") {
        response.status(409).json({
          error: "This activity no longer uses invitations.",
          code: "activity_not_invite_only",
        });
        return;
      }

      const { data, error } = await supabase.rpc("join_activity_as_user", {
        p_activity_id: invitation.activity_id,
        p_user_id: session.user.id,
      });

      const result = membershipRpcRow(data);

      if (error || !result) {
        request.log.error(
          {
            err: error,
            invitationId,
            activityId: invitation.activity_id,
            userId: session.user.id,
          },
          "Unable to join activity from invitation",
        );

        response.status(500).json({
          error: "The invitation could not be accepted.",
        });
        return;
      }

      if (result.result !== "joined" && result.result !== "already_member") {
        if (result.result === "full") {
          response.status(409).json({
            error: "The activity is full.",
            code: "activity_full",
          });
          return;
        }

        if (result.result === "activity_started") {
          response.status(409).json({
            error: "The activity has already started.",
            code: "activity_started",
          });
          return;
        }

        if (result.result === "not_active") {
          response.status(409).json({
            error: "The activity is no longer active.",
            code: "activity_not_active",
          });
          return;
        }

        if (result.result === "not_found") {
          response.status(404).json({
            error: "Activity not found.",
            code: "activity_not_found",
          });
          return;
        }

        request.log.error(
          {
            rpcResult: result.result,
            invitationId,
            activityId: invitation.activity_id,
          },
          "Unexpected activity invitation acceptance result",
        );

        response.status(500).json({
          error: "The invitation could not be accepted.",
        });
        return;
      }

      const { data: acceptedInvitation, error: updateError } = await supabase
        .from("activity_invitations")
        .update({
          status: "accepted",
          responded_at: new Date().toISOString(),
        })
        .eq("id", invitationId)
        .eq("invitee_id", session.user.id)
        .eq("status", "pending")
        .select("id,status")
        .maybeSingle();

      if (updateError) {
        request.log.error(
          {
            err: updateError,
            invitationId,
            activityId: invitation.activity_id,
          },
          "Unable to mark activity invitation as accepted",
        );

        response.status(500).json({
          error: "The invitation could not be accepted.",
        });
        return;
      }

      if (!acceptedInvitation) {
        const { data: currentInvitation } = await supabase
          .from("activity_invitations")
          .select("status")
          .eq("id", invitationId)
          .maybeSingle();

        if (currentInvitation?.status !== "accepted") {
          response.status(409).json({
            error: "The invitation has changed.",
            code: "invitation_changed",
          });
          return;
        }
      }

      if (acceptedInvitation) {
        await notifyInvitationResponse(
          invitation.activity_id, session.user.id, invitationId,
          "activity_invitation_accepted", invitation.updated_at,
        );
      }
      response.json({
        result:
          result.result === "already_member" ? "already_accepted" : "accepted",
        activityId: invitation.activity_id,
        memberCount: result.member_count,
        maxParticipants: result.max_participants,
      });
    } catch (error) {
      request.log.error(
        {
          err: error,
          invitationId,
          userId: session.user.id,
        },
        "Unable to accept activity invitation",
      );

      response.status(500).json({
        error: "The invitation could not be accepted.",
      });
    }
  },
);

router.post(
  "/activities/invitations/:invitationId/decline",
  async (request, response) => {
    let session;

    try {
      session = await currentSession(request, response);
    } catch (error) {
      request.log.error(
        { err: error },
        "Unable to authenticate activity invitation decline",
      );

      response.status(401).json({
        error: "Authentication required.",
      });
      return;
    }

    if (!session) {
      response.status(401).json({
        error: "Authentication required.",
      });
      return;
    }

    const invitationId = request.params.invitationId;

    if (!UUID_PATTERN.test(invitationId)) {
      response.status(404).json({
        error: "Invitation not found.",
        code: "invitation_not_found",
      });
      return;
    }

    try {
      const supabase = getSupabaseAdmin();

      const { data: invitation, error: invitationError } = await supabase
        .from("activity_invitations")
        .select("id,activity_id,status,updated_at")
        .eq("id", invitationId)
        .eq("invitee_id", session.user.id)
        .maybeSingle();

      if (invitationError) {
        request.log.error(
          {
            err: invitationError,
            invitationId,
            userId: session.user.id,
          },
          "Unable to load invitation before decline",
        );

        response.status(500).json({
          error: "The invitation could not be declined.",
        });
        return;
      }

      if (!invitation) {
        response.status(404).json({
          error: "Invitation not found.",
          code: "invitation_not_found",
        });
        return;
      }

      if (invitation.status === "declined") {
        response.json({
          result: "already_declined",
          activityId: invitation.activity_id,
        });
        return;
      }

      if (invitation.status === "accepted") {
        response.status(409).json({
          error: "An accepted invitation cannot be declined.",
          code: "invitation_already_accepted",
        });
        return;
      }

      const { data: declinedInvitation, error: updateError } = await supabase
        .from("activity_invitations")
        .update({
          status: "declined",
          responded_at: new Date().toISOString(),
        })
        .eq("id", invitationId)
        .eq("invitee_id", session.user.id)
        .eq("status", "pending")
        .select("id,status")
        .maybeSingle();

      if (updateError) {
        request.log.error(
          {
            err: updateError,
            invitationId,
          },
          "Unable to decline activity invitation",
        );

        response.status(500).json({
          error: "The invitation could not be declined.",
        });
        return;
      }

      if (!declinedInvitation) {
        response.status(409).json({
          error: "The invitation has changed.",
          code: "invitation_changed",
        });
        return;
      }

      await notifyInvitationResponse(
        invitation.activity_id, session.user.id, invitationId,
        "activity_invitation_declined", invitation.updated_at,
      );
      response.json({
        result: "declined",
        activityId: invitation.activity_id,
      });
    } catch (error) {
      request.log.error(
        {
          err: error,
          invitationId,
          userId: session.user.id,
        },
        "Unable to decline activity invitation",
      );

      response.status(500).json({
        error: "The invitation could not be declined.",
      });
    }
  },
);

router.post("/activities/:id/join", async (request, response) => {
  let session;
  try {
    session = await currentSession(request, response);
  } catch (error) {
    request.log.error({ err: error }, "Unable to authenticate activity join");
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  if (!session) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  const activityId = request.params.id;
  if (!UUID_PATTERN.test(activityId)) {
    response.status(404).json({
      error: "Activity not found.",
      code: "activity_not_found",
    });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: activity, error: activityError } = await supabase
      .from("activities")
      .select("id,creator_id,visibility,status,starts_at")
      .eq("id", activityId)
      .maybeSingle();

    if (activityError) {
      request.log.error(
        {
          err: activityError,
          activityId,
          userId: session.user.id,
        },
        "Unable to check activity visibility before joining",
      );

      response.status(500).json({
        error: "The activity could not be joined.",
      });
      return;
    }

    if (!activity) {
      response.status(404).json({
        error: "Activity not found.",
        code: "activity_not_found",
      });
      return;
    }

    if (activity.status !== "active") {
      response.status(409).json({
        error: "The activity is not active.",
        code: "activity_not_active",
      });
      return;
    }

    const startsAt = Date.parse(activity.starts_at);

    if (Number.isFinite(startsAt) && startsAt <= Date.now()) {
      response.status(409).json({
        error: "The activity has already started.",
        code: "activity_started",
      });
      return;
    }

    if (
      activity.visibility === "invite_only" &&
      activity.creator_id !== session.user.id
    ) {
      const { data: existingMembership, error: membershipError } =
        await supabase
          .from("activity_members")
          .select("role")
          .eq("activity_id", activityId)
          .eq("user_id", session.user.id)
          .maybeSingle();

      if (membershipError) {
        request.log.error(
          {
            err: membershipError,
            activityId,
            userId: session.user.id,
          },
          "Unable to check membership before joining invite-only activity",
        );

        response.status(500).json({
          error: "The activity could not be joined.",
        });
        return;
      }

      if (!existingMembership) {
        response.status(403).json({
          error: "This activity is only available by invitation.",
          code: "activity_invite_only",
        });
        return;
      }
    }

    if (
      activity.visibility === "friends" &&
      activity.creator_id !== session.user.id
    ) {
      const { data: existingMembership, error: membershipError } =
        await supabase
          .from("activity_members")
          .select("role")
          .eq("activity_id", activityId)
          .eq("user_id", session.user.id)
          .maybeSingle();

      if (membershipError) {
        request.log.error(
          {
            err: membershipError,
            activityId,
            userId: session.user.id,
          },
          "Unable to check membership before joining friends-only activity",
        );

        response.status(500).json({
          error: "The activity could not be joined.",
        });
        return;
      }

      if (!existingMembership) {
        const connection = await findConnection(
          session.user.id,
          activity.creator_id,
        );

        if (connection?.status !== "accepted") {
          response.status(403).json({
            error:
              "This activity is only available to the organizer's friends.",
            code: "activity_friends_only",
          });
          return;
        }
      }
    }

    const { data, error } = await supabase.rpc("join_activity_as_user", {
      p_activity_id: activityId,
      p_user_id: session.user.id,
    });
    const result = membershipRpcRow(data);

    if (error || !result) {
      request.log.error(
        { err: error, activityId, userId: session.user.id },
        "Unable to join activity",
      );
      response.status(500).json({ error: "The activity could not be joined." });
      return;
    }

    if (result.result === "joined" && result.member_count !== null) {
      await createNotification({
        recipientId: activity.creator_id,
        actorId: session.user.id,
        activityId,
        type: "activity_joined",
      });

      response.json({
        result: result.result,
        memberCount: result.member_count,
        maxParticipants: result.max_participants,
      });
      return;
    }

    if (result.result === "already_member" && result.member_count !== null) {
      response.json({
        result: result.result,
        memberCount: result.member_count,
        maxParticipants: result.max_participants,
      });
      return;
    }

    if (result.result === "full" && result.member_count !== null) {
      response.status(409).json({
        error: "The activity is full.",
        code: "activity_full",
        memberCount: result.member_count,
        maxParticipants: result.max_participants,
      });
      return;
    }

    if (result.result === "not_active") {
      response.status(409).json({
        error: "The activity is not active.",
        code: "activity_not_active",
      });
      return;
    }

    if (result.result === "activity_started") {
      response.status(409).json({
        error: "The activity has already started.",
        code: "activity_started",
        memberCount: result.member_count,
        maxParticipants: result.max_participants,
      });
      return;
    }

    if (result.result === "not_found") {
      response.status(404).json({
        error: "Activity not found.",
        code: "activity_not_found",
      });
      return;
    }

    request.log.error(
      { rpcResult: result.result, activityId, userId: session.user.id },
      "Unexpected join activity result",
    );
    response.status(500).json({ error: "The activity could not be joined." });
  } catch (error) {
    request.log.error(
      { err: error, activityId, userId: session.user.id },
      "Unable to join activity",
    );
    response.status(500).json({ error: "The activity could not be joined." });
  }
});

router.delete("/activities/:id/membership", async (request, response) => {
  let session;
  try {
    session = await currentSession(request, response);
  } catch (error) {
    request.log.error({ err: error }, "Unable to authenticate activity leave");
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  if (!session) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  const activityId = request.params.id;
  if (!UUID_PATTERN.test(activityId)) {
    response.status(404).json({
      error: "Activity not found.",
      code: "activity_not_found",
    });
    return;
  }

  try {
    const { data, error } = await getSupabaseAdmin().rpc(
      "leave_activity_as_user",
      {
        p_activity_id: activityId,
        p_user_id: session.user.id,
      },
    );
    const result = membershipRpcRow(data);

    if (error || !result) {
      request.log.error(
        { err: error, activityId, userId: session.user.id },
        "Unable to leave activity",
      );
      response.status(500).json({ error: "The activity could not be left." });
      return;
    }

    if (result.result === "left" && result.member_count !== null) {
      const { error: invitationCleanupError } = await getSupabaseAdmin()
        .from("activity_invitations")
        .delete()
        .eq("activity_id", activityId)
        .eq("invitee_id", session.user.id)
        .eq("status", "accepted");

      if (invitationCleanupError) {
        request.log.error(
          {
            err: invitationCleanupError,
            activityId,
            userId: session.user.id,
          },
          "Unable to clean accepted invitation after leaving activity",
        );
      }

      response.json({
        result: result.result,
        memberCount: result.member_count,
        maxParticipants: result.max_participants,
      });
      return;
    }

    if (result.result === "not_member") {
      if (result.member_count === null) {
        response.status(404).json({
          error: "Activity not found.",
          code: "activity_not_found",
        });
        return;
      }

      response.json({
        result: result.result,
        memberCount: result.member_count,
        maxParticipants: result.max_participants,
      });
      return;
    }

    if (result.result === "organizer_cannot_leave") {
      response.status(409).json({
        error: "The organizer cannot leave the activity.",
        code: "organizer_cannot_leave",
      });
      return;
    }

    if (result.result === "activity_started") {
      response.status(409).json({
        error: "The activity has already started.",
        code: "activity_started",
        memberCount: result.member_count,
        maxParticipants: result.max_participants,
      });
      return;
    }

    request.log.error(
      { rpcResult: result.result, activityId, userId: session.user.id },
      "Unexpected leave activity result",
    );
    response.status(500).json({ error: "The activity could not be left." });
  } catch (error) {
    request.log.error(
      { err: error, activityId, userId: session.user.id },
      "Unable to leave activity",
    );
    response.status(500).json({ error: "The activity could not be left." });
  }
});

export default router;
