import { describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  collectHostKitDoctorReport,
  detectLoadedConfig,
  detectRolesAndPermissions,
  enumerateChildHandles,
  enumerateOpenPorts,
  enumerateLeases,
  detectOrphans,
  generateFreshProcessProof,
  detectCursorsAndDeadlines,
  detectProcessIds,
  type HostKitDoctorReport,
} from "../../src/host-kit/doctor.ts";

const ROOT = process.cwd();

describe("host-kit/doctor", () => {
  describe("detectLoadedConfig", () => {
    it("returns config info from rules/manifest.yaml when present", async () => {
      const result = await detectLoadedConfig(ROOT);
      // Non-null source when manifest exists at repo root
      if (result.configSource !== null) {
        expect(result.configSource).toContain("manifest");
        expect(result.configHash).toMatch(/^[a-f0-9]{64}$/);
      }
      expect(typeof result.generation === "number" || result.generation === null).toBe(true);
    });

    it("never includes generated/ or .agent/ paths in configSource", async () => {
      const result = await detectLoadedConfig(ROOT);
      if (result.configSource !== null) {
        expect(result.configSource).not.toMatch(/^generated\//);
        expect(result.configSource).not.toMatch(/^\.agent\//);
      }
    });

    it("returns null fields on a non-existent root", async () => {
      const result = await detectLoadedConfig("/nonexistent/path/12345");
      expect(result.generation).toBeNull();
      expect(result.configHash).toBeNull();
      expect(result.configSource).toBeNull();
    });
  });

  describe("detectRolesAndPermissions", () => {
    it("returns arrays of roles and permissions", async () => {
      const result = await detectRolesAndPermissions(ROOT);
      expect(Array.isArray(result.roles)).toBe(true);
      expect(Array.isArray(result.permissions)).toBe(true);
    });

    it("permissions include capability prefixes", async () => {
      const result = await detectRolesAndPermissions(ROOT);
      const caps = result.permissions.filter((p) => p.startsWith("capability:"));
      // Known capabilities from the schema
      expect(caps.length).toBeGreaterThan(0);
    });

    it("fails open on non-existent repo root", async () => {
      const result = await detectRolesAndPermissions("/nonexistent/45678");
      expect(Array.isArray(result.roles)).toBe(true);
      expect(Array.isArray(result.permissions)).toBe(true);
    });
  });

  describe("enumerateChildHandles", () => {
    it("returns an array of ProcessHandle objects", async () => {
      const handles = await enumerateChildHandles();
      expect(Array.isArray(handles)).toBe(true);
      for (const h of handles) {
        expect(typeof h.pid).toBe("number");
        expect(typeof h.ppid).toBe("number");
        expect(h.pid).toBeGreaterThan(0);
      }
    });

    it("all child ppids equal the current process pid", async () => {
      const handles = await enumerateChildHandles();
      const myPid = process.pid;
      for (const h of handles) {
        expect(h.ppid).toBe(myPid);
      }
    });
  });

  describe("detectProcessIds", () => {
    it("returns current, parent, group and session info", async () => {
      const result = await detectProcessIds();
      expect(typeof result.current).toBe("number");
      expect(result.current).toBe(process.pid);
      // parent may be null on some platforms
      expect(result.parent === null || typeof result.parent === "number").toBe(true);
      // group/session may be null on some platforms
      expect(result.group === null || typeof result.group === "number").toBe(true);
      expect(result.session === null || typeof result.session === "number").toBe(true);
    });
  });

  describe("detectCursorsAndDeadlines", () => {
    it("returns semantic cursor with position and deadline", async () => {
      const result = await detectCursorsAndDeadlines(ROOT);
      expect(typeof result.semanticCursor.position).toBe("number");
      expect(result.semanticCursor.deadline === null || typeof result.semanticCursor.deadline === "string").toBe(true);
      expect(Array.isArray(result.eventCursors)).toBe(true);
      expect(result.queueAgeMs === null || typeof result.queueAgeMs === "number").toBe(true);
    });

    it("fails open on non-existent root", async () => {
      const result = await detectCursorsAndDeadlines("/nonexistent/99999");
      expect(result.semanticCursor.position).toBe(0);
      expect(result.semanticCursor.deadline).toBeNull();
      expect(result.queueAgeMs).toBeNull();
    });
  });

  describe("enumerateOpenPorts", () => {
    it("returns an array of PortLease objects", async () => {
      const ports = await enumerateOpenPorts();
      expect(Array.isArray(ports)).toBe(true);
      for (const p of ports) {
        expect(typeof p.port).toBe("number");
        expect(["tcp", "udp"]).toContain(p.protocol);
        expect(typeof p.state).toBe("string");
      }
    });

    it("port numbers are in valid range", async () => {
      const ports = await enumerateOpenPorts();
      for (const p of ports) {
        expect(p.port).toBeGreaterThan(0);
        expect(p.port).toBeLessThanOrEqual(65535);
      }
    });
  });

  describe("enumerateLeases", () => {
    it("returns an array of LeaseEntry objects", async () => {
      const leases = await enumerateLeases(ROOT);
      expect(Array.isArray(leases)).toBe(true);
      for (const l of leases) {
        expect(["test", "mcp", "browser", "compose"]).toContain(l.kind);
        expect(["active", "released", "orphaned"]).toContain(l.status);
        expect(typeof l.label).toBe("string");
        expect(typeof l.acquiredAt).toBe("string");
      }
    });

    it("fails open on non-existent root", async () => {
      const leases = await enumerateLeases("/nonexistent/77777");
      expect(Array.isArray(leases)).toBe(true);
    });
  });

  describe("detectOrphans", () => {
    it("returns an array of OrphanedResource objects", async () => {
      const orphans = await detectOrphans(ROOT);
      expect(Array.isArray(orphans)).toBe(true);
      for (const o of orphans) {
        expect(["process", "port", "file", "session"]).toContain(o.kind);
        expect(typeof o.path).toBe("string");
        expect(typeof o.reason).toBe("string");
        expect(typeof o.detectedAt).toBe("string");
      }
    });

    it("fails open on non-existent root", async () => {
      const orphans = await detectOrphans("/nonexistent/88888");
      expect(Array.isArray(orphans)).toBe(true);
    });
  });

  describe("generateFreshProcessProof", () => {
    it("returns a valid FreshProcessProof object", async () => {
      const config = await detectLoadedConfig(ROOT);
      const roles = await detectRolesAndPermissions(ROOT);
      const handles = await enumerateChildHandles();
      const ports = await enumerateOpenPorts();
      const leases = await enumerateLeases(ROOT);
      const orphans = await detectOrphans(ROOT);
      const { semanticCursor, queueAgeMs } = await detectCursorsAndDeadlines(ROOT);

      const proof = await generateFreshProcessProof(
        ROOT, config, roles.roles, roles.permissions,
        handles, ports, leases, orphans, semanticCursor, queueAgeMs,
      );

      expect(proof.schema).toBe("host-kit/fresh-process-proof");
      expect(proof.version).toBe(1);
      expect(proof.proofId).toMatch(/^[0-9a-f-]{36}$/);
      expect(proof.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(proof.pid).toBe(process.pid);
      expect(proof.hostname).toBe(os.hostname());
      expect(proof.platform).toBe(process.platform);
      expect(proof.systemSnapshot.totalMemoryMb).toBeGreaterThan(0);
      expect(proof.systemSnapshot.cpuCount).toBeGreaterThan(0);
      expect(proof.systemSnapshot.uptimeSeconds).toBeGreaterThan(0);
      expect(typeof proof.configHash).toBe("string");
      expect(proof.configHash).toMatch(/^[a-f0-9]{64}$/);
      expect(proof.childHandleCount).toBe(handles.length);
      expect(proof.openPortCount).toBe(ports.length);
      expect(proof.leaseCount).toBe(leases.filter((l) => l.status === "active").length);
      expect(proof.orphanCount).toBe(orphans.length);
    });
  });

  describe("collectHostKitDoctorReport", () => {
    it("returns a complete HostKitDoctorReport", async () => {
      const report = await collectHostKitDoctorReport(ROOT);

      expect(report.schema).toBe("host-kit/doctor-report");
      expect(report.version).toBe(1);
      expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(report.host).toBe(os.hostname());
      expect(report.pid).toBe(process.pid);
      expect(report.platform).toBe(process.platform);

      // Loaded config
      expect(typeof report.loadedConfig.generation === "number" || report.loadedConfig.generation === null).toBe(true);
      expect(typeof report.loadedConfig.configHash === "string" || report.loadedConfig.configHash === null).toBe(true);

      // Roles / permissions
      expect(Array.isArray(report.roles));
      expect(Array.isArray(report.permissions));

      // Handles
      expect(Array.isArray(report.childHandles));
      expect(Array.isArray(report.sessionHandles));
      expect(Array.isArray(report.eventCursors));

      // PIDs
      expect(typeof report.pids.current === "number").toBe(true);
      expect(report.pids.current).toBe(process.pid);

      // Ports / leases / orphans
      expect(Array.isArray(report.openPorts));
      expect(Array.isArray(report.leases));
      expect(Array.isArray(report.orphans));

      // Fresh proof
      expect(report.freshProof.schema).toBe("host-kit/fresh-process-proof");
      expect(report.freshProof.proofId).toMatch(/^[0-9a-f-]{36}$/);
      expect(report.freshProof.pid).toBe(process.pid);
    });

    it("freshProof generation timestamp matches report generatedAt", async () => {
      const report = await collectHostKitDoctorReport(ROOT);
      const reportTime = new Date(report.generatedAt).getTime();
      const proofTime = new Date(report.freshProof.generatedAt).getTime();
      // Proof should be generated at the same instant as the report (within 1s)
      expect(Math.abs(reportTime - proofTime)).toBeLessThan(1000);
    });

    it("proof configHash matches loadedConfig.configHash when available", async () => {
      const report = await collectHostKitDoctorReport(ROOT);
      if (report.loadedConfig.configHash !== null) {
        expect(report.freshProof.configHash).toBe(report.loadedConfig.configHash);
      }
    });

    it("proof generation matches loadedConfig.generation", async () => {
      const report = await collectHostKitDoctorReport(ROOT);
      if (report.loadedConfig.generation !== null) {
        expect(report.freshProof.generation).toBe(report.loadedConfig.generation);
      }
    });

    it("orphans are capped at 50 entries", async () => {
      const report = await collectHostKitDoctorReport(ROOT);
      expect(report.orphans.length).toBeLessThanOrEqual(50);
    });

    it("orphan entries never reference generated/ or .agent/ paths", async () => {
      const report = await collectHostKitDoctorReport(ROOT);
      for (const o of report.orphans) {
        expect(o.path).not.toMatch(/^generated\//);
        // Allow .agent/worktrees but not other .agent/ subpaths
        if (o.path.includes(".agent")) {
          expect(o.path).toContain("worktrees");
        }
      }
    });

    it("fresh proof system snapshot is realistic", async () => {
      const report = await collectHostKitDoctorReport(ROOT);
      const snap = report.freshProof.systemSnapshot;
      expect(snap.totalMemoryMb).toBeGreaterThan(0);
      expect(snap.freeMemoryMb).toBeGreaterThanOrEqual(0);
      expect(snap.freeMemoryMb).toBeLessThanOrEqual(snap.totalMemoryMb);
      expect(snap.cpuCount).toBeGreaterThan(0);
      expect(snap.platform).toBe(process.platform);
      expect(snap.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });
  });
});
