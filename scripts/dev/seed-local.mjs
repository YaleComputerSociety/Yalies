// Called only by local.mjs with its fixed, loopback-only database connection.
import { createRequire } from "node:module";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { Sequelize, Op } = require("sequelize");

export async function seedLocal(databaseUrl, preferredNetid) {
  const target = new URL(databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== "55432" || target.pathname !== "/yalies_dev") {
    throw new Error("Local seeding requires 127.0.0.1:55432/yalies_dev");
  }
  const sql = new Sequelize(databaseUrl, { logging: false });
  try {
    await sql.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    const models = {};
    for (const name of ["Person", "Session", "APIKey", "UserProfile", "ProfileLike", "Friendship", "DataChangeRequest"]) {
      const { default: Model } = await import(`../../apps/api/build/helpers/models/${name}Model.js`);
      Model.initModel(sql);
      await Model.sync(); // No force/alter: preserve local edits and restored snapshots.
      models[name] = Model;
    }
    if (await models.Person.count() !== 0) {
      const person = preferredNetid
        ? await models.Person.findOne({ where: { netid: preferredNetid } })
        : await models.Person.findOne({ where: { netid: "dev1" } })
          || await models.Person.findOne({ where: { netid: { [Op.ne]: null, [Op.notIn]: [""] } }, order: [["id", "ASC"]] });
      if (preferredNetid && !person) throw new Error(`Development login ${preferredNetid} is not in the local directory`);
      if (!person || !/^[a-z][a-z0-9]*$/i.test(person.netid)) throw new Error("Local people need a valid NetID for dev login");
      console.log("Local database already has people; keeping existing data.");
      return person.netid;
    }
    const names = [
      ["Alex", "Morgan"], ["Sam", "Rivera"], ["Jordan", "Chen"], ["Taylor", "Patel"],
      ["Casey", "Brooks"], ["Riley", "Kim"], ["Jamie", "Reed"], ["Avery", "Singh"],
      ["Quinn", "Park"], ["Drew", "Bennett"], ["Skyler", "Diaz"], ["Robin", "Shah"],
    ];
    const colleges = ["Berkeley", "Branford", "Davenport", "Ezra Stiles", "Grace Hopper", "Jonathan Edwards",
      "Morse", "Pauli Murray", "Pierson", "Saybrook", "Silliman", "Timothy Dwight"];
    const majors = ["Computer Science", "History", "Mathematics", "Economics", "English", "Physics"];
    await sql.transaction(async transaction => {
      await models.Person.bulkCreate(names.map(([first_name, last_name], i) => ({
        id: i + 1, netid: i === 0 ? "dev1" : `demo${i + 1}`, first_name, last_name,
        email: `person${i + 1}@example.test`, school: "Yale College", school_code: "YC",
        year: new Date().getFullYear() + i % 4, college: colleges[i], major: majors[i % majors.length],
        pronouns: i % 2 ? "they/them" : "she/her", address: "New Haven, CT, United States",
        address_state: "CT", address_country: "United States", birth_month: i + 1, birth_day: i + 1,
        leave: false, visitor: false,
      })), { transaction });
      await models.UserProfile.create({
        netid: "dev1", description: "Fictional local development profile", interests: ["Coding", "Music"],
        classes: ["CPSC 201"],
      }, { transaction });
    });
    console.log("Seeded 12 fictional people. Local login: dev1 (Alex Morgan).");
    return "dev1";
  } finally {
    await sql.close();
  }
}
