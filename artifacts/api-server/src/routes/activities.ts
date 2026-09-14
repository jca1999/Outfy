import { Router, type IRouter, type Request } from "express";

import { getSupabaseAdmin } from "../lib/supabase";
import { currentSession } from "./auth";

type ActivityRequest = {
  title?: unknown;
  description?: unknown;
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

const router: IRouter = Router();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

function bodyOf(request: Request): ActivityRequest {
  return request.body && typeof request.body === "object"
    ? (request.body as ActivityRequest)
    : {};
}

function requiredString(
  value: unknown,
  name: string,
  maxLength?: number,
) {
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
  let currency = optionalString(body.currency, "currency")?.toUpperCase() ?? null;

  if (costType === "free") {
    estimatedCost = null;
    currency = null;
  } else {
    if (estimatedCost !== null && estimatedCost <= 0) {
      throw new Error("estimatedCost must be greater than zero");
    }
    if (
      estimatedCost !== null &&
      (estimatedCost > 99_999_999.99 ||
        !Number.isInteger(estimatedCost * 100))
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

  return {
    title,
    description,
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

router.post("/activities", async (request, response) => {
  let session;
  try {
    session = await currentSession(request, response);
  } catch (error) {
    request.log.error({ err: error }, "Unable to authenticate activity creator");
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
    response.status(400).json({ error: "Check the activity details and try again." });
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
      response.status(500).json({ error: "The activity could not be published." });
      return;
    }

    response.status(201).json({ activity: { id: data.id } });
  } catch (error) {
    request.log.error(
      { err: error, userId: session.user.id },
      "Unable to create activity",
    );
    response.status(500).json({ error: "The activity could not be published." });
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
        "id,creator_id,title,description,category,subcategory,starts_at,ends_at,timezone_name,location_type,country_code,region_code,region_name,city,meeting_point,online_platform,participation_mode,max_participants,cost_type,estimated_cost,currency,status",
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

    if (
      !activity ||
      (activity.status !== "active" &&
        activity.creator_id !== session.user.id)
    ) {
      response.status(404).json({ error: "Activity not found." });
      return;
    }

    const [profileResult, memberResult] = await Promise.all([
      getSupabaseAdmin()
        .from("profiles")
        .select("username,display_name")
        .eq("id", activity.creator_id)
        .maybeSingle(),
      getSupabaseAdmin()
        .from("activity_members")
        .select("*", { count: "exact", head: true })
        .eq("activity_id", activity.id),
    ]);

    if (profileResult.error || memberResult.error) {
      request.log.error(
        {
          profileError: profileResult.error,
          memberError: memberResult.error,
          activityId,
        },
        "Unable to load activity details",
      );
      response.status(500).json({ error: "The activity could not be loaded." });
      return;
    }

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
        organizer: {
          username: profileResult.data?.username ?? null,
          displayName: profileResult.data?.display_name ?? null,
        },
        memberCount: memberResult.count ?? 0,
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

export default router;