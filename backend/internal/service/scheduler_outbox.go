package service

import (
	"context"
	"time"
)

type SchedulerOutboxEvent struct {
	ID        int64
	EventType string
	AccountID *int64
	GroupID   *int64
	Payload   map[string]any
	CreatedAt time.Time
}

// SchedulerOutboxRepository 提供调度 outbox 的读取与裁剪接口。
type SchedulerOutboxRepository interface {
	ListAfter(ctx context.Context, afterID int64, limit int) ([]SchedulerOutboxEvent, error)
	MaxID(ctx context.Context) (int64, error)
	// DeleteConsumedUpTo 删除 id <= watermark 且超过 grace 窗口的已消费行。
	// limit 限制单次删除批量；返回实际删除行数。
	DeleteConsumedUpTo(ctx context.Context, watermark int64, limit int) (int64, error)
	// TryAcquireCleanupLock 通过 PG advisory lock 防多实例并发清理。
	TryAcquireCleanupLock(ctx context.Context) (SchedulerOutboxCleanupLease, bool, error)
}

// SchedulerOutboxCleanupLease 持有 cleanup 期间的 PG advisory lock，Release 释放并归还连接。
type SchedulerOutboxCleanupLease interface {
	Release()
}
