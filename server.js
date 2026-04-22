require("dotenv").config({ override: true });
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/rest\/v1\/?$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

app.use(express.json());
app.use(express.static(__dirname));

function toBool(value) {
  if (typeof value === "boolean") return value;
  return String(value || "").toLowerCase() === "true";
}

function toInt(value) {
  const num = Number.parseInt(String(value || "0"), 10);
  return Number.isNaN(num) ? 0 : num;
}

async function getSettingsMap() {
  const { data, error } = await supabase.from("settings").select("key,value");
  if (error) throw error;
  return (data || []).reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

app.post("/api/login", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const idNumber = String(req.body.id_number || "").trim();
    if (!name || !idNumber) {
      return res.status(400).json({ success: false, message: "Name and ID are required." });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("user_id,name,id_number,has_voted,vote_timestamp")
      .eq("name", name)
      .eq("id_number", idNumber)
      .maybeSingle();
    if (error) throw error;
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid name or ID number." });
    }

    return res.json({
      success: true,
      user: {
        user_id: user.user_id,
        name: user.name,
        id_number: user.id_number,
        has_voted: toBool(user.has_voted),
        vote_timestamp: user.vote_timestamp || ""
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Login failed.", error: error.message });
  }
});

app.get("/api/parties", async (_req, res) => {
  try {
    const { data: activeParties, error } = await supabase
      .from("parties")
      .select("*")
      .eq("is_active", true);
    if (error) throw error;
    return res.json({ success: true, parties: activeParties });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load parties.", error: error.message });
  }
});

app.post("/api/vote", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const idNumber = String(req.body.id_number || "").trim();
    const partyId = String(req.body.party_id || "").trim();
    if (!name || !idNumber || !partyId) {
      return res.status(400).json({ success: false, message: "Name, ID, and party are required." });
    }

    const settings = await getSettingsMap();
    if ((settings.election_status || "").toLowerCase() !== "open") {
      return res.status(403).json({ success: false, message: "Election is closed." });
    }

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("user_id,name,id_number,has_voted,vote_timestamp")
      .eq("name", name)
      .eq("id_number", idNumber)
      .maybeSingle();
    if (userError) throw userError;
    if (!user) {
      return res.status(401).json({ success: false, message: "User not found." });
    }
    if (toBool(user.has_voted)) {
      return res.status(409).json({ success: false, message: "User already voted." });
    }

    const { data: party, error: partyError } = await supabase
      .from("parties")
      .select("party_id,party_name,is_active")
      .eq("party_id", partyId)
      .eq("is_active", true)
      .maybeSingle();
    if (partyError) throw partyError;
    if (!party) {
      return res.status(404).json({ success: false, message: "Party not found." });
    }

    const timestamp = new Date().toISOString();
    const { data: voteRow, error: voteReadError } = await supabase
      .from("votes")
      .select("party_id,party_name,vote_count")
      .eq("party_id", party.party_id)
      .maybeSingle();
    if (voteReadError) throw voteReadError;

    const nextVoteCount = toInt(voteRow?.vote_count) + 1;
    const { error: voteWriteError } = await supabase.from("votes").upsert(
      {
        party_id: party.party_id,
        party_name: party.party_name,
        vote_count: nextVoteCount
      },
      { onConflict: "party_id" }
    );
    if (voteWriteError) throw voteWriteError;

    const { error: userUpdateError } = await supabase
      .from("users")
      .update({ has_voted: true, vote_timestamp: timestamp })
      .eq("user_id", user.user_id);
    if (userUpdateError) throw userUpdateError;

    return res.json({
      success: true,
      message: "Vote submitted successfully.",
      vote: { party_id: party.party_id, party_name: party.party_name, timestamp }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not submit vote.", error: error.message });
  }
});

app.get("/api/results", async (_req, res) => {
  try {
    const [parties, votes, users, settings] = await Promise.all([
      supabase.from("parties").select("party_id,party_name,is_active"),
      supabase.from("votes").select("party_id,party_name,vote_count"),
      supabase.from("users").select("user_id"),
      getSettingsMap()
    ]);
    if (parties.error) throw parties.error;
    if (votes.error) throw votes.error;
    if (users.error) throw users.error;

    if (!toBool(settings.results_visible)) {
      return res.status(403).json({ success: false, message: "Results are hidden right now." });
    }

    const partyRows = parties.data || [];
    const voteRows = votes.data || [];
    const userRows = users.data || [];
    const activeParties = partyRows.filter((party) => toBool(party.is_active));
    const totalVotes = voteRows.reduce((sum, voteRow) => sum + toInt(voteRow.vote_count), 0);
    const totalUsers = userRows.length;

    const byParty = activeParties.map((party) => {
      const voteRow = voteRows.find((vote) => vote.party_id === party.party_id);
      const voteCount = voteRow ? toInt(voteRow.vote_count) : 0;
      const percentage = totalVotes === 0 ? 0 : (voteCount / totalVotes) * 100;
      return {
        party_id: party.party_id,
        party_name: party.party_name,
        vote_count: voteCount,
        percentage: Number(percentage.toFixed(2))
      };
    });

    byParty.sort((a, b) => b.vote_count - a.vote_count);
    const winner = byParty[0] || null;
    const turnout = totalUsers === 0 ? 0 : Number(((totalVotes / totalUsers) * 100).toFixed(2));

    return res.json({
      success: true,
      results: byParty,
      summary: { total_votes: totalVotes, total_users: totalUsers, turnout, winner }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load results.", error: error.message });
  }
});

app.get("/api/settings", async (_req, res) => {
  try {
    const settings = await getSettingsMap();
    return res.json({ success: true, settings });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load settings.", error: error.message });
  }
});

app.put("/api/settings", async (req, res) => {
  try {
    const electionStatus = String(req.body.election_status || "").trim();
    const resultsVisible = req.body.results_visible;
    const validStatus = ["not_started", "open", "closed"];

    if (electionStatus && !validStatus.includes(electionStatus)) {
      return res.status(400).json({ success: false, message: "Invalid election_status value." });
    }
    if (resultsVisible !== undefined && typeof resultsVisible !== "boolean") {
      return res.status(400).json({ success: false, message: "results_visible must be true or false." });
    }

    if (electionStatus) {
      const { error: statusError } = await supabase
        .from("settings")
        .update({ value: electionStatus })
        .eq("key", "election_status");
      if (statusError) throw statusError;
    }
    if (resultsVisible !== undefined) {
      const { error: visibleError } = await supabase
        .from("settings")
        .update({ value: String(resultsVisible).toUpperCase() })
        .eq("key", "results_visible");
      if (visibleError) throw visibleError;
    }

    const settings = await getSettingsMap();
    return res.json({ success: true, message: "Settings updated.", settings });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not update settings.", error: error.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Election app running at http://localhost:${PORT}`);
  });
}

module.exports = app;
