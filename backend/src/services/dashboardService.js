import { sessionRepo, reportRepo } from '../repositories/index.js';

export const dashboardService = {
  async getSummary(user) {
    // If candidate, scope to their own sessions; if admin/interviewer, all sessions
    const filter = user.role === 'candidate' ? { candidateId: user.sub, limit: 1000 } : { limit: 1000 };
    const { items: sessions } = await sessionRepo.list(filter);

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter((s) => s.status === 'completed').length;
    const completionRate = totalSessions > 0 ? Number(((completedSessions / totalSessions) * 100).toFixed(1)) : 0;

    // Fetch reports for all sessions
    const reports = [];
    for (const session of sessions) {
      const rep = await reportRepo.findBySessionId(session.id);
      if (rep) reports.push({ session, report: rep });
    }

    const scores = reports.map((r) => r.report.scores?.overall || 0);
    const averageScore = scores.length > 0 ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : 0;

    // Trends over time (sorted by creation date)
    const sortedReports = [...reports].sort(
      (a, b) => new Date(a.report.createdAt).getTime() - new Date(b.report.createdAt).getTime()
    );

    const trendLabels = sortedReports.map((r, i) =>
      r.report.createdAt ? new Date(r.report.createdAt).toLocaleDateString() : `Session ${i + 1}`
    );
    const trendData = sortedReports.map((r) => r.report.scores?.overall || 0);

    // Per-role breakdown
    const roleMap = {};
    for (const { session, report } of reports) {
      const role = session.role || 'General';
      if (!roleMap[role]) roleMap[role] = [];
      roleMap[role].push(report.scores?.overall || 0);
    }

    const roleLabels = Object.keys(roleMap);
    const roleData = roleLabels.map((role) => {
      const sc = roleMap[role];
      return Number((sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(1));
    });

    return {
      totals: {
        totalSessions,
        completedSessions,
        completionRate: `${completionRate}%`,
        averageScore,
      },
      trends: {
        labels: trendLabels.length > 0 ? trendLabels : ['No Sessions'],
        datasets: [
          {
            label: 'Overall Score Trend',
            data: trendData.length > 0 ? trendData : [0],
            borderColor: '#34d399',
            backgroundColor: 'rgba(52, 211, 153, 0.1)',
          },
        ],
      },
      perRoleBreakdown: {
        labels: roleLabels.length > 0 ? roleLabels : ['No Roles'],
        datasets: [
          {
            label: 'Average Score by Role',
            data: roleData.length > 0 ? roleData : [0],
            backgroundColor: ['#38bdf8', '#818cf8', '#34d399', '#f472b6', '#fbbf24'],
          },
        ],
      },
    };
  },
};

