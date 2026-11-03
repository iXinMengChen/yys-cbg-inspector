(() => {
  const criteria = JSON.parse(__CRITERIA_JSON__);
  const serverIds = JSON.parse(__SERVER_IDS_JSON__);
  const normalize = (value) =>
    String(value ?? "")
      .replace(/\s+/g, "")
      .trim();
  const pageText = normalize(document.body?.innerText);

  if (
    /login|passport|account\/login/i.test(location.pathname) ||
    /扫码登录|手机号登录/.test(pageText)
  ) {
    return { status: "login_required" };
  }
  if (/安全验证|滑动验证|访问异常|风险控制|captcha/i.test(pageText)) {
    return { status: "security_check" };
  }

  const currentParams = new URLSearchParams(location.search);
  const isRoleFilter =
    location.pathname.includes("/cgi/mweb/advance/search") &&
    currentParams.get("search_type") === "role";

  if (!isRoleFilter) {
    if (window.__yysCbgRoleSearchNavigating) return { status: "navigating" };
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    };
    const entry = [
      ...document.querySelectorAll("a,button,[role=link],[role=button]"),
    ].find(
      (element) =>
        visible(element) && normalize(element.innerText) === "角色筛选",
    );
    window.__yysCbgRoleSearchNavigating = true;
    window.setTimeout(() => {
      window.__yysCbgRoleSearchNavigating = false;
    }, 5000);
    if (entry instanceof HTMLAnchorElement) {
      const target = new URL(entry.href, location.href);
      if (
        target.origin === location.origin &&
        target.pathname.includes("/advance/search")
      ) {
        window.location.href = target.href;
        return { status: "navigating" };
      }
    }
    if (entry) {
      entry.click();
      return { status: "navigating" };
    }
    const target = new URL("/cgi/mweb/advance/search", location.origin);
    target.searchParams.set("backurl", "/pl/role");
    target.searchParams.set("from", "out");
    target.searchParams.set("search_type", "role");
    target.searchParams.set("tfid", currentParams.get("tfid") || "f_kingkong");
    const referSn = currentParams.get("refer_sn");
    if (referSn) target.searchParams.set("refer_sn", referSn);
    window.location.href = target.href;
    return { status: "navigating" };
  }

  const target = new URL("/cgi/mweb/pl", location.origin);
  const params = target.searchParams;
  const applied = [];
  const unsupported = [];
  params.set("search_type", "role");
  params.set("tfid", currentParams.get("tfid") || "f_kingkong");
  const referSn = currentParams.get("refer_sn");
  if (referSn) params.set("refer_sn", referSn);

  const add = (key, value, scale = 1) => {
    if (value === null || value === undefined || value === "") return;
    const number = Number(value);
    if (!Number.isFinite(number)) {
      unsupported.push(key);
      return;
    }
    params.set(key, String(Math.round(number * scale)));
    applied.push(key);
  };
  const addFlag = (key) => {
    params.set(key, "1");
    applied.push(key);
  };

  add("price_min", criteria.minimumPrice, 100);
  add("price_max", criteria.maximumPrice, 100);
  if (criteria.publication === "only") {
    params.set("pass_fair_show", "0");
    applied.push("pass_fair_show");
  } else if (criteria.publication === "exclude") {
    unsupported.push("不看公示期");
  }

  const dexParams = {
    ssr: "full_ssr",
    sp: "full_sp",
    collaboration: "full_x",
    ur: "full_ur",
  };
  for (const value of criteria.dexRequirements ?? []) {
    if (Object.hasOwn(dexParams, value)) addFlag(dexParams[value]);
    else unsupported.push(`图鉴:${value}`);
  }

  const numberParams = {
    minimumSixStarHeroCount: ["six_star_num", 1],
    minimumStyle: ["fengzidu", 1],
    minimumScatteredSpeed: ["max_sanjian_speed", 100],
    minimumLuckySpeed: ["max_zhaocai_speed", 100],
    minimumHeadCount: ["tou_counts", 1],
    minimumHeadSpeed: ["tou_speed", 100],
    minimumTailCount: ["wei_counts", 1],
    minimumTailSpeed: ["wei_speed", 100],
    minimumLuckyHeadCount: ["zhaocai_tou_counts", 1],
    minimumLuckyHeadSpeed: ["zhaocai_tou_speed", 100],
    minimumMaxSpeedCount: ["full_speed_yuhun", 1],
    jade: ["goyu", 1],
    stamina: ["strength", 1],
    mysteryAmulet: ["gameble_card", 1],
    goldWan: ["money", 10000],
    御行达摩: ["black_egg_num", 1],
    满级御魂: ["qianghua_yuhun_num", 1],
    minimumSignInDays: ["sign_days", 1],
    maximumLevel: ["equip_level", 1],
    式神皮肤总数: ["ss_skin_num", 1],
    典藏皮肤总数: ["collection_skin_num", 1],
    庭院皮肤总数: ["yard_skin_num", 1],
  };
  for (const [key, value] of Object.entries(criteria.numberFilters ?? {})) {
    if (value === null || value === undefined) continue;
    if (Object.hasOwn(numberParams, key)) {
      const [param, scale] = numberParams[key];
      add(param, value, scale);
    } else {
      unsupported.push(key);
    }
  }

  const flags = {
    曜之阁开启: "yzg_open",
    永久勾玉卡: "gouyu_card",
    心易徽记: "is_xinyi_vip",
  };
  for (const flag of criteria.assetFlags ?? []) {
    if (Object.hasOwn(flags, flag)) addFlag(flags[flag]);
    else unsupported.push(`资产:${flag}`);
  }

  const badges = [...new Set(criteria.badges ?? [])];
  const knownBadges = ["秘闻·天下一", "地域·天下一", "馆主·博", "终极之巅"];
  if (badges.some((value) => !knownBadges.includes(value))) {
    unsupported.push("徽章");
  } else if (badges.length === knownBadges.length) {
    params.set("honor_id", "950013,950007,900414,950060");
    applied.push("honor_id");
  } else if (badges.length) {
    unsupported.push("徽章 ID 映射待确认");
  }

  const achievements = [...new Set(criteria.achievements ?? [])];
  const knownAchievements = [
    "征服世界",
    "非洲·大阴阳师",
    "阴阳师·大神",
    "对弈竞猜·卓见",
  ];
  if (achievements.some((value) => !knownAchievements.includes(value))) {
    unsupported.push("成就");
  } else if (achievements.length === knownAchievements.length) {
    params.set("achieve_ids", "10100,289,239,306645");
    applied.push("achieve_ids");
  } else if (achievements.length) {
    unsupported.push("成就 ID 映射待确认");
  }

  if (criteria.selectedServers?.length) {
    const ids = new Set();
    for (const value of criteria.selectedServers) {
      const [group, ...parts] = String(value).split("/");
      const names = Object.hasOwn(serverIds, group)
        ? serverIds[group]
        : undefined;
      const name = parts.join("/");
      const id = names && Object.hasOwn(names, name) ? names[name] : undefined;
      if (id) ids.add(id);
      else unsupported.push(`区服:${value}`);
    }
    if (ids.size) {
      params.set("serverid", [...ids].join(","));
      applied.push("serverid");
    }
  }
  const platformTypes = { iOS: "1", Android: "2" };
  const selectedPlatformTypes = Object.entries(platformTypes)
    .filter(([platform]) => criteria.platforms?.includes(platform))
    .map(([, platformType]) => platformType);
  for (const platform of criteria.platforms ?? []) {
    if (!Object.hasOwn(platformTypes, platform))
      unsupported.push(`平台:${platform}`);
  }
  if (selectedPlatformTypes.length) {
    params.set("platform_type", selectedPlatformTypes.join(","));
    applied.push("platform_type");
  }

  if (!applied.length && !unsupported.length)
    return { status: "no_conditions" };
  if (unsupported.length)
    return { status: "unsupported", unsupported: [...new Set(unsupported)] };

  window.location.replace(target.href);
  return { status: "submitted", applied, url: target.href };
})();
