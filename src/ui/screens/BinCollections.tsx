import React from "react";
import { BinCollectionsDoc } from "../../domain/types";
import {
  formatBinDate,
  formatServiceLabel,
  formatUpdatedLabel,
  getServiceIcon,
  getNextGroup,
  getUpcomingGroups,
} from "../../utils/binCollections";

export type BinCollectionsRefreshNotice = { message: string; tone: "info" | "error" };

interface BinCollectionsProps {
  data: BinCollectionsDoc | null;
  loading: boolean;
  error: string | null;
  overlayEnabled: boolean;
  onOverlayChange: (next: boolean) => void;
  refreshing: boolean;
  refreshNotice: BinCollectionsRefreshNotice | null;
  onRefresh: () => void;
}

export default function BinCollections({
  data,
  loading,
  error,
  overlayEnabled,
  onOverlayChange,
  refreshing,
  refreshNotice,
  onRefresh,
}: BinCollectionsProps) {
  if (loading) {
    return (
      <div className="screen">
        <div className="card">
          <h3>Bin collections</h3>
          <div className="muted">Loading bin collections...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="screen">
        <div className="card">
          <div className="row">
            <h3>Bin collections</h3>
            <button className="btn btn-ghost" disabled={refreshing} onClick={onRefresh}>
              {refreshing ? "Refreshing..." : "Refresh now"}
            </button>
          </div>
          <div className="muted">{error ?? "Bin collections unavailable."}</div>
          {refreshNotice ? (
            <div className={refreshNotice.tone === "error" ? "field-error" : "meta-text"}>
              {refreshNotice.message}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const upcomingGroups = getUpcomingGroups(data, 8);
  const nextGroup = getNextGroup(data);
  const lastUpdated = formatUpdatedLabel(data.updatedAt);

  return (
    <div className="screen">
      <div className="card">
        <div className="row">
          <h3>Bin collections</h3>
          <button className="btn btn-ghost" disabled={refreshing} onClick={onRefresh}>
            {refreshing ? "Refreshing..." : "Refresh now"}
          </button>
        </div>
        <div className="meta-text">Last updated: {lastUpdated}</div>
        {refreshNotice ? (
          <div className={refreshNotice.tone === "error" ? "field-error" : "meta-text"}>
            {refreshNotice.message}
          </div>
        ) : null}
        <div className="form">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={overlayEnabled}
              onChange={(event) => onOverlayChange(event.target.checked)}
            />
            Overlay on calendar
          </label>
        </div>
      </div>

      <div className="card">
        <h3>Next collections</h3>
        {nextGroup ? (
          <div className="bin-group">
            <div className="bin-date">{formatBinDate(nextGroup.date)}</div>
            <ul className="bin-services">
              {nextGroup.events.map((event, index) => {
                const icon = getServiceIcon(event);
                return (
                  <li key={`${event.serviceId}-${index}`} className="bin-service">
                    <span>{formatServiceLabel(event)}</span>
                    <span className="bin-meta">
                      {icon ? (
                        <img className="bin-icon" src={icon.src} alt={icon.alt} />
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="muted">No upcoming collections.</div>
        )}
      </div>

      <div className="card">
        <h3>Upcoming</h3>
        {upcomingGroups.length === 0 ? (
          <div className="muted">No upcoming collections.</div>
        ) : (
          <ul className="list">
            {upcomingGroups.map((group) => (
              <li key={group.date} className="bin-group">
                <div className="bin-date">{formatBinDate(group.date)}</div>
                <ul className="bin-services">
                  {group.events.map((event, index) => {
                    const icon = getServiceIcon(event);
                    return (
                      <li key={`${event.serviceId}-${index}`} className="bin-service">
                        <span>{formatServiceLabel(event)}</span>
                        <span className="bin-meta">
                          {icon ? (
                            <img className="bin-icon" src={icon.src} alt={icon.alt} />
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
