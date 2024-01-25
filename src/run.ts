import { info, setFailed, getInput, warning } from "@actions/core";
import { Context } from "@actions/github/lib/context";
import { Issue, Jira } from "./jira";

const mapJiraIssues = async (ids: string[]): Promise<Issue[]> => {
  const jiraUrl = getInput("jiraUrl");
  if (!jiraUrl) {
    warning(`Not checking parent issue because of missing JIRA URL`);
    return [];
  }

  const jira = new Jira(
    jiraUrl,
    getInput("jiraUsername"),
    getInput("jiraToken")
  );

  const issues = [];

  for (const id of ids) {
    const issue = await jira.getIssue(id, { fields: "issuetype" });
    issues.push(issue);
  }

  return issues;
};

const containsParentIssue = (issues: Issue[]): boolean => {
    return !!issues.find(issue => !issue?.fields?.issuetype?.subtask);
};

const containsSpikeIssue = (issues: Issue[]): boolean => {
    return !!issues.find(issue => issue?.fields?.issuetype?.name === "Spike");
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
    let message = `Pull Request title "${pullRequestTitle}" failed to pass match regexp - ${regex}\n`;
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

  const message = `Pull Request title "${pullRequestTitle}" doesn't contain JIRA parent issue ID\n`;

  if (
    !pullRequestTitle ||
    ids.length === 0
  ) {
    setFailed(message);
    return;
  }

  const issues = await mapJiraIssues(ids);
  if (containsParentIssue(issues)) {
    setFailed(message);
    return;
  }
  
  if (containsSpikeIssue(issues)) {
    setFailed(`Pull Request title contains a Spike issue, which is not allowed\n`);
    return;
  }
};
