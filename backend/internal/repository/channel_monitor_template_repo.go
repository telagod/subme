package repository

import (
	"context"
	"database/sql"
	"fmt"

	dbent "github.com/telagod/subme/ent"
	"github.com/telagod/subme/ent/channelmonitor"
	"github.com/telagod/subme/ent/channelmonitorrequesttemplate"
	"github.com/telagod/subme/internal/service"
)

// channelMonitorRequestTemplateRepository implements service.ChannelMonitorRequestTemplateRepository.
// Kept in a separate file from channelMonitorRepository for clarity.
type channelMonitorRequestTemplateRepository struct {
	client *dbent.Client
	db     *sql.DB
}

// NewChannelMonitorRequestTemplateRepository creates a new template repository instance.
func NewChannelMonitorRequestTemplateRepository(client *dbent.Client, db *sql.DB) service.ChannelMonitorRequestTemplateRepository {
	return &channelMonitorRequestTemplateRepository{client: client, db: db}
}

// ---------- CRUD ----------

func (r *channelMonitorRequestTemplateRepository) Create(ctx context.Context, t *service.ChannelMonitorRequestTemplate) error {
	entClient := clientFromContext(ctx, r.client)

	mutation := entClient.ChannelMonitorRequestTemplate.Create().
		SetName(t.Name).
		SetProvider(channelmonitorrequesttemplate.Provider(t.Provider)).
		SetAPIMode(defaultAPIModeRepo(t.APIMode)).
		SetDescription(t.Description).
		SetExtraHeaders(emptyHeadersIfNilRepo(t.ExtraHeaders)).
		SetBodyOverrideMode(defaultBodyModeRepo(t.BodyOverrideMode))

	if t.BodyOverride != nil {
		mutation = mutation.SetBodyOverride(t.BodyOverride)
	}

	saved, saveErr := mutation.Save(ctx)
	if saveErr != nil {
		return translatePersistenceError(saveErr, service.ErrChannelMonitorTemplateNotFound, nil)
	}
	t.ID = saved.ID
	t.CreatedAt = saved.CreatedAt
	t.UpdatedAt = saved.UpdatedAt
	return nil
}

func (r *channelMonitorRequestTemplateRepository) GetByID(ctx context.Context, id int64) (*service.ChannelMonitorRequestTemplate, error) {
	found, findErr := r.client.ChannelMonitorRequestTemplate.Query().
		Where(channelmonitorrequesttemplate.IDEQ(id)).
		Only(ctx)
	if findErr != nil {
		return nil, translatePersistenceError(findErr, service.ErrChannelMonitorTemplateNotFound, nil)
	}
	return convertEntToTemplate(found), nil
}

func (r *channelMonitorRequestTemplateRepository) Update(ctx context.Context, t *service.ChannelMonitorRequestTemplate) error {
	entClient := clientFromContext(ctx, r.client)

	mutation := entClient.ChannelMonitorRequestTemplate.UpdateOneID(t.ID).
		SetName(t.Name).
		SetAPIMode(defaultAPIModeRepo(t.APIMode)).
		SetDescription(t.Description).
		SetExtraHeaders(emptyHeadersIfNilRepo(t.ExtraHeaders)).
		SetBodyOverrideMode(defaultBodyModeRepo(t.BodyOverrideMode))

	if t.BodyOverride != nil {
		mutation = mutation.SetBodyOverride(t.BodyOverride)
	} else {
		mutation = mutation.ClearBodyOverride()
	}

	saved, saveErr := mutation.Save(ctx)
	if saveErr != nil {
		return translatePersistenceError(saveErr, service.ErrChannelMonitorTemplateNotFound, nil)
	}
	t.UpdatedAt = saved.UpdatedAt
	return nil
}

func (r *channelMonitorRequestTemplateRepository) Delete(ctx context.Context, id int64) error {
	entClient := clientFromContext(ctx, r.client)
	if delErr := entClient.ChannelMonitorRequestTemplate.DeleteOneID(id).Exec(ctx); delErr != nil {
		return translatePersistenceError(delErr, service.ErrChannelMonitorTemplateNotFound, nil)
	}
	return nil
}

func (r *channelMonitorRequestTemplateRepository) List(ctx context.Context, params service.ChannelMonitorRequestTemplateListParams) ([]*service.ChannelMonitorRequestTemplate, error) {
	query := r.client.ChannelMonitorRequestTemplate.Query()

	if params.Provider != "" {
		query = query.Where(channelmonitorrequesttemplate.ProviderEQ(channelmonitorrequesttemplate.Provider(params.Provider)))
	}
	if params.APIMode != "" {
		query = query.Where(channelmonitorrequesttemplate.APIModeEQ(defaultAPIModeRepo(params.APIMode)))
	}

	results, listErr := query.
		Order(dbent.Asc(channelmonitorrequesttemplate.FieldProvider), dbent.Asc(channelmonitorrequesttemplate.FieldAPIMode), dbent.Asc(channelmonitorrequesttemplate.FieldName)).
		All(ctx)
	if listErr != nil {
		return nil, fmt.Errorf("listing monitor request templates: %w", listErr)
	}

	templates := make([]*service.ChannelMonitorRequestTemplate, 0, len(results))
	for _, row := range results {
		templates = append(templates, convertEntToTemplate(row))
	}
	return templates, nil
}

// ApplyToMonitors propagates the current template config to the specified monitor IDs.
// The WHERE clause requires both template_id match and ID-in-list, preventing accidental
// overwrites of monitors not associated with this template. Uses ent UpdateMany to preserve hooks.
func (r *channelMonitorRequestTemplateRepository) ApplyToMonitors(ctx context.Context, id int64, monitorIDs []int64) (int64, error) {
	if len(monitorIDs) == 0 {
		return 0, nil
	}

	entClient := clientFromContext(ctx, r.client)

	tpl, lookupErr := entClient.ChannelMonitorRequestTemplate.Query().
		Where(channelmonitorrequesttemplate.IDEQ(id)).
		Only(ctx)
	if lookupErr != nil {
		return 0, translatePersistenceError(lookupErr, service.ErrChannelMonitorTemplateNotFound, nil)
	}

	bulk := entClient.ChannelMonitor.Update().
		Where(
			channelmonitor.TemplateIDEQ(id),
			channelmonitor.IDIn(monitorIDs...),
			channelmonitor.ProviderEQ(channelmonitor.Provider(tpl.Provider)),
			channelmonitor.APIModeEQ(defaultAPIModeRepo(tpl.APIMode)),
		).
		SetAPIMode(defaultAPIModeRepo(tpl.APIMode)).
		SetExtraHeaders(emptyHeadersIfNilRepo(tpl.ExtraHeaders)).
		SetBodyOverrideMode(defaultBodyModeRepo(tpl.BodyOverrideMode))

	if tpl.BodyOverride != nil {
		bulk = bulk.SetBodyOverride(tpl.BodyOverride)
	} else {
		bulk = bulk.ClearBodyOverride()
	}

	changed, applyErr := bulk.Save(ctx)
	if applyErr != nil {
		return 0, fmt.Errorf("propagating template to associated monitors: %w", applyErr)
	}
	return int64(changed), nil
}

// CountAssociatedMonitors returns the number of monitors linked to a template (for UI display).
func (r *channelMonitorRequestTemplateRepository) CountAssociatedMonitors(ctx context.Context, id int64) (int64, error) {
	n, countErr := r.client.ChannelMonitor.Query().
		Where(channelmonitor.TemplateIDEQ(id)).
		Count(ctx)
	if countErr != nil {
		return 0, fmt.Errorf("counting monitors associated with template %d: %w", id, countErr)
	}
	return int64(n), nil
}

// ListAssociatedMonitors returns brief info for monitors linked to a template.
// Results are ordered by name for stable frontend rendering.
func (r *channelMonitorRequestTemplateRepository) ListAssociatedMonitors(ctx context.Context, id int64) ([]*service.AssociatedMonitorBrief, error) {
	monitors, queryErr := r.client.ChannelMonitor.Query().
		Where(channelmonitor.TemplateIDEQ(id)).
		Order(dbent.Asc(channelmonitor.FieldName)).
		All(ctx)
	if queryErr != nil {
		return nil, fmt.Errorf("listing monitors associated with template %d: %w", id, queryErr)
	}

	briefs := make([]*service.AssociatedMonitorBrief, 0, len(monitors))
	for _, m := range monitors {
		briefs = append(briefs, &service.AssociatedMonitorBrief{
			ID:       m.ID,
			Name:     m.Name,
			Provider: string(m.Provider),
			APIMode:  defaultAPIModeRepo(m.APIMode),
			Enabled:  m.Enabled,
		})
	}
	return briefs, nil
}

// ---------- helpers ----------

func convertEntToTemplate(row *dbent.ChannelMonitorRequestTemplate) *service.ChannelMonitorRequestTemplate {
	if row == nil {
		return nil
	}
	hdrs := row.ExtraHeaders
	if hdrs == nil {
		hdrs = map[string]string{}
	}
	return &service.ChannelMonitorRequestTemplate{
		ID:               row.ID,
		Name:             row.Name,
		Provider:         string(row.Provider),
		APIMode:          defaultAPIModeRepo(row.APIMode),
		Description:      row.Description,
		ExtraHeaders:     hdrs,
		BodyOverrideMode: row.BodyOverrideMode,
		BodyOverride:     row.BodyOverride,
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        row.UpdatedAt,
	}
}
