param(
  [Parameter(Mandatory=$true)][ValidateSet("plan","research","implement","bugfix","review")][string]$Phase,
  [ValidateSet("low","medium","high")][string]$Risk = "medium",
  [switch]$LargeArchitecture,
  [switch]$BugStillStuck,
  [switch]$UseJson
)

$result = switch ($Phase) {
  "plan" {
    if ($LargeArchitecture -or $Risk -eq "high") {
      [ordered]@{
        phase = "plan"
        profile = "planner"
        model = "gpt-5.5"
        effort = "high"
        reason = "Large architecture or high-risk planning"
      }
    } else {
      [ordered]@{
        phase = "plan"
        profile = "planner"
        model = "gpt-5.5"
        effort = "medium"
        reason = "Default planning profile"
      }
    }
  }
  "research" {
    [ordered]@{
      phase = "research"
      profile = "researcher"
      model = "gpt-5.4"
      effort = "medium"
      reason = "Researcher default profile"
    }
  }
  "implement" {
    [ordered]@{
      phase = "implement"
      profile = "implementer"
      model = "gpt-5.3-codex"
      effort = "medium"
      reason = "Default implementation profile"
    }
  }
  "bugfix" {
    if ($BugStillStuck) {
      [ordered]@{
        phase = "bugfix"
        profile = "bugfixer-escalated"
        model = "gpt-5.5"
        effort = "medium"
        reason = "Bug is still stuck after normal bugfix path"
      }
    } else {
      [ordered]@{
        phase = "bugfix"
        profile = "bugfixer"
        model = "gpt-5.4"
        effort = "medium"
        reason = "Default difficult bugfix profile"
      }
    }
  }
  "review" {
    if ($Risk -eq "high" -or $LargeArchitecture) {
      [ordered]@{
        phase = "review"
        profile = "reviewer-highrisk"
        model = "gpt-5.5"
        effort = "high"
        reason = "High-risk or large-task review"
      }
    } else {
      [ordered]@{
        phase = "review"
        profile = "reviewer"
        model = "gpt-5.4"
        effort = "medium"
        reason = "Default review profile"
      }
    }
  }
}

if ($UseJson) {
  $result | ConvertTo-Json -Depth 5
} else {
  Write-Host "Phase:   $($result.phase)"
  Write-Host "Profile: $($result.profile)"
  Write-Host "Model:   $($result.model)"
  Write-Host "Effort:  $($result.effort)"
  Write-Host "Reason:  $($result.reason)"
}
