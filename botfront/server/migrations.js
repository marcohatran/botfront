import { sortBy, isEqual } from 'lodash';
import { safeDump, safeLoad } from 'js-yaml';
import { Instances } from '../imports/api/instances/instances.collection';
import { GlobalSettings } from '../imports/api/globalSettings/globalSettings.collection';
import { Projects } from '../imports/api/project/project.collection';
import { Stories } from '../imports/api/story/stories.collection';
import { StoryGroups } from '../imports/api/storyGroups/storyGroups.collection';
import { aggregateEvents } from '../imports/lib/story.utils';
import { indexBotResponse } from '../imports/api/graphql/botResponses/mongo/botResponses';
import { indexStory } from '../imports/api/story/stories.index';
import Activity from '../imports/api/graphql/activity/activity.model';

/* globals Migrations */

Migrations.add({
    version: 1,
    up: () => {
        Instances.find()
            .fetch()
            .forEach((i) => {
                console.log(i);
                if (!i.type) Instances.update({ _id: i._id }, { $set: { type: ['nlu'] } });
            });
    },
});

Migrations.add({
    version: 2,
    // add default default domain to global settings, and update projects to have this default domain
    up: () => {
        let spec = process.env.ORCHESTRATOR ? `.${process.env.ORCHESTRATOR}` : '.docker-compose';
        if (process.env.MODE === 'development') spec = `${spec}.dev`;
        if (process.env.MODE === 'test') spec = `${spec}.ci`;
        let globalSettings;
        try {
            globalSettings = JSON.parse(Assets.getText(`default-settings${spec}.json`));
        } catch (e) {
            globalSettings = JSON.parse(Assets.getText('default-settings.json'));
        }
        const { defaultDefaultDomain } = globalSettings.settings.private;

        GlobalSettings.update({ _id: 'SETTINGS' }, { $set: { 'settings.private.defaultDefaultDomain': defaultDefaultDomain } });

        Projects.find().fetch()
            .forEach((i) => {
                Projects.update({ _id: i._id }, { $set: { defaultDomain: { content: defaultDefaultDomain } } });
            });
    },
});

// eslint-disable-next-line import/first
import assert from 'assert';
// eslint-disable-next-line import/first
import BotResponses from '../imports/api/graphql/botResponses/botResponses.model';


const migrateResponses = () => {
    const countUtterMatches = (templateValues) => {
        const re = /utter_/g;
        return ((JSON.stringify(templateValues) || '').match(re) || []).length;
    };
    try {
        Projects.find()
            .fetch()
            .forEach((p) => {
                if (p.templates) {
                    const templates = sortBy(p.templates, 'key');
                    const newTemplates = [];
                    const duplicates = [];
                    templates.forEach((t, index) => {
                    // Delete irrelevant fields and set new _id
                        delete t.match;
                        delete t.followUp;
                        t.projectId = p._id;
                        // Put duplicates in a separate list
                        if ((index < templates.length - 1 && t.key === templates[index + 1].key) || (index > 0 && t.key === templates[index - 1].key)) {
                            duplicates.push(t);
                        } else {
                            newTemplates.push(t);
                        }
                    });
                    let i = 0;
                    while (i < duplicates.length) {
                        let numberOfOccurence = 1;
                        while (i + numberOfOccurence < duplicates.length && duplicates[i].key === duplicates[i + numberOfOccurence].key) {
                            numberOfOccurence += 1;
                        }
                        const duplicateValues = duplicates.slice(i, i + numberOfOccurence);
                        assert(Array.from(new Set(duplicateValues.map(t => t.key))).length === 1); // Make sure duplicates are real
                        // Count times /utter_/ is a match
                        const utters = duplicateValues.map(t => countUtterMatches(t.values));
                        // Find the index of the template with less /utter_/ in it. This is the value we'll keep
                        const index = utters.indexOf(Math.min(...utters));
                        // Push the template we keep in the array of valid bot responses
                        newTemplates.push(duplicateValues[index]);
                        i += numberOfOccurence;
                    }

                    // Integrity check
                    const distinctInDuplicates = [...new Set(duplicates.map(d => d.key))].length;
                    // duplicates.length - distinctInDuplicates: give back the number of occurence of a value minus one
                    assert(newTemplates.length === templates.length - (duplicates.length - distinctInDuplicates));
                    assert(Array.from(new Set(newTemplates)).length === newTemplates.length);
                    // Insert bot responses in new collection
                    newTemplates.forEach((response) => {
                        BotResponses.updateOne({ key: response.key, projectId: response.projectId }, response, { upsert: true, setDefaultsOnInsert: true }).exec();
                    });
                    // Remote bot responses from project
                    Projects.update({ _id: p._id }, { $unset: { templates: '' } });
                }
            });
    } catch (err) {
        console.log(`The bot responses migration encountered an error: ${err}`);
    }
};

// migrateResponses();
Migrations.add({
    version: 3,
    // add default default domain to global settings, and update projects to have this default domain
    up: () => migrateResponses(),
});
Migrations.add({
    version: 4,
    up: () => {
        const allStories = Stories.find().fetch();
        allStories.forEach((story) => {
            const events = aggregateEvents(story);
            Stories.update({ _id: story._id }, { $set: { events } });
        });
    },
});

const processSequence = sequence => sequence
    .map(s => safeLoad(s.content))
    .reduce((acc, curr) => {
        const newSequent = {};
        if (curr.text && !acc.text) newSequent.text = curr.text;
        if (curr.text && acc.text) newSequent.text = `${acc.text}\n\n${curr.text}`;
        if (curr.buttons) newSequent.buttons = [...(acc.buttons || []), ...curr.buttons];
        return newSequent;
    }, {});

Migrations.add({
    version: 5,
    // join sequences of text in responsesa
    up: () => {
        BotResponses.find().lean().then(responses => responses.forEach((response) => {
            const updatedResponse = {
                ...response,
                values: response.values.map(value => ({
                    ...value,
                    sequence: [{ content: safeDump(processSequence(value.sequence)) }], //
                })),
            };
            delete updatedResponse._id;
            if (!isEqual(response, updatedResponse)) {
                const { projectId, key } = response;
                BotResponses.updateOne({ projectId, key }, updatedResponse).exec();
            }
        }));
    },
});
Migrations.add({
    version: 6,
    // Remove object ids from activities
    up: async () => {
        Activity.find()
            .lean()
            .then(activities => activities.forEach(async (activity) => {
                if (typeof activity._id !== 'string') {
                    try {
                        const { _id, ...activityWithoutId } = activity;
                        await Activity.deleteOne(activityWithoutId);
                        const idString = activity._id.toString();

                        await Activity.create({
                            _id: idString,
                            ...activityWithoutId,
                        });
                    } catch (e) {
                        console.log(
                            'something went wrong during a migration, contact Botfront for further help',
                        );
                    }
                }
            }));
    },
});
Migrations.add({
    version: 7,
    // Touch up on story and storygroup schema
    up: async () => {
        const stories = Stories.find().fetch();
        const children = {};
        const projectIds = new Set();

        stories.forEach((s) => {
            // add to list of children
            children[s.storyGroupId] = [...(children[s.storyGroupId] || []), s._id];
            projectIds.add(s.projectId);
        });

        const storyGroups = StoryGroups.find().fetch();
        storyGroups.sort((a, b) => b.introStory - a.introStory);

        storyGroups.forEach(sg => StoryGroups.update(
            { _id: sg._id },
            {
                $set: {
                    isExpanded: !!sg.introStory,
                    children: children[sg._id],
                },
            },
        ));

        // add storygroup key under projects
        Array.from(projectIds).forEach((projectId) => {
            const storyGroupsForProject = storyGroups
                .filter(sg => sg.projectId === projectId)
                .map(sg => sg._id);
            Projects.update({ _id: projectId }, { $set: { storyGroups: storyGroupsForProject } });
        });
    },
});


Migrations.add({
    version: 8,
    up: () => {
        BotResponses.find()
            .lean()
            .then((botResponses) => {
                botResponses.forEach((botResponse) => {
                    const textIndex = indexBotResponse(botResponse);
                    BotResponses.updateOne({ _id: botResponse._id }, { textIndex }).exec();
                });
            });
        const allStories = Stories.find().fetch();
        allStories.forEach((story) => {
            const { textIndex } = indexStory(story);
            Stories.update({ _id: story._id }, { $set: { textIndex } });
        });
    },
});
Migrations.add({
    version: 9,
    up: () => {
        const allStories = Stories.find().fetch();
        allStories.forEach((story) => {
            const { textIndex, events } = indexStory(story, { includeEventsField: true });
            Stories.update({ _id: story._id }, { $set: { textIndex, events } });
        });
    },
});
Meteor.startup(() => {
    Migrations.migrateTo('latest');
});
