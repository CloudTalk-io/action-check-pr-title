import { info, setFailed, getInput, warning } from "@actions/core";
import { Context } from "@actions/github/lib/context";
import { Jira } from "./jira";

export const containsParentIssueID = async (ids: string[]): Promise<boolean> => {
  const jiraUrl = getInput("jiraUrl");
  if (!jiraUrl) {
    warning(`Not checking parent issue because of missing JIRA URL`);
    return true;
  }

  const jira = new Jira(
    jiraUrl,
    getInput("jiraUsername"),
    getInput("jiraToken")
  );

  for (const id of ids) {
    const issue = await jira.getIssue(id, { fields: "issuetype" });
    if (issue.fields?.issuetype?.subtask === false) {
      info(`Found parent issue ${id}`);
      return true;
    }
  }

  return false;
};

export const isIssueSpike = async (ids: string[]): Promise<boolean> => {
  const jiraUrl = getInput("jiraUrl");
  if (!jiraUrl) {
    warning(`Not checking parent issue because of missing JIRA URL`);
    return false;
  }

  const jira = new Jira(
    jiraUrl,
    getInput("jiraUsername"),
    getInput("jiraToken")
  );

  for (const id of ids) {
    const issue = await jira.getIssue(id, { fields: "issuetype" });
    if (issue.fields?.issuetype?.subtask === false &&
        issue.fields?.issuetype?.name === "Spike") {
      info(`Found Spike issue ${id}`);
      return true;
    }
  }

  return false;
};

export const run = async (context: Context) => {
  const { eventName } = context;
  info(`Event name: ${eventName}`);

  if (eventName !== "pull_request") {
    setFailed(`Invalid event: ${eventName}, it should be use on pull_request`);
    return;
  }

  const pullRequestTitle = context?.payload?.pull_request?.title;

  info(`Pull Request title: "${pullRequestTitle}"`);

  const regex = RegExp(getInput("regexp"), getInput("flags"));
  const helpMessage = getInput("helpMessage");
  if (!regex.test(pullRequestTitle)) {
    let message = `Pull Request title "${pullRequestTitle}" failed to pass match regexp - ${regex}
`;
    if (helpMessage) {
      message = message.concat(helpMessage);
    }

    setFailed(message);
    return;
  }

  let flags = getInput("jiraIDFlags");
  flags = flags.includes("g") ? flags : flags + "g";
  const regex2 = RegExp(getInput("jiraIDRegexp"), flags);

  const skipIDs = getInput("jiraSkipCheck")?.split(",") || [];
  const ids = [...pullRequestTitle.matchAll(regex2)][0];
  if (ids.find((id: string) => skipIDs.includes(id.toLowerCase()))) {
    return;
  }

  if (
    !pullRequestTitle ||
    ids.length === 0 ||
    !(await containsParentIssueID(ids))
  ) {
    const message = `Pull Request title "${pullRequestTitle}" doesn't contain JIRA parent issue ID
`;
    setFailed(message);
    return;
  }

  if (await isIssueSpike(ids)) {
    const message = `Pull Request title contains a Spike issue, which is not allowed`;
    setFailed(message);
    return;
  }
};
