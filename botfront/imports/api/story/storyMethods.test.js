
import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Stories } from './stories.collection';

if (Meteor.isServer) {
    import './stories.methods';

    const storyIds = ['story_A', 'story_B'];
    const storyFixtureA = {
        _id: storyIds[0],
        title: 'Welcome Story',
        storyGroupId: 'pYAvAsYw256uy8bGF',
        projectId: 'bf',
        events: [
            'utter_hello',
            'utter_tXd-Pm66',
            'utter_Xywmv8uc',
            'utter_hwZIDQ5P',
            'utter_0H5XEC9h',
            'action_help',
        ],
        branches: [
            {
                title: 'New Branch 1',
                branches: [],
                _id: 'story_A_branch_A',
                story: '* helpOptions\n  - action_help\n  - utter_tXd-Pm66',
            },
            {
                title: 'New Branch 2',
                branches: [],
                _id: 'story_A_branch_B',
                story:
                    '* how_are_you\n  - utter_Xywmv8uc\n* mood{"positive": "good"}\n  - utter_hwZIDQ5P\n  - utter_0H5XEC9h\n  - slot{"mood":"set"}',
            },
        ],
        story: '* hello\n - utter_hello',
    };
    const storyFixtureB = {
        _id: storyIds[1],
        title: 'Welcome Story',
        storyGroupId: 'pYAvAsYw256uy8bGF',
        projectId: 'bf',
        events: [
            'utter_hello',
            'utter_tXd-Pm66',
            'utter_Xywmv8uc',
            'utter_hwZIDQ5P',
            'utter_0H5XEC9h',
            'action_help',
        ],
        branches: [
            {
                title: 'New Branch 1',
                branches: [],
                _id: 'story_B_branch_A',
                story: '* helpOptions\n  - action_help\n  - utter_tXd-Pm66',
            },
            {
                title: 'New Branch 2',
                branches: [],
                _id: 'story_B_branch_B',
                story:
                    '* how_are_you\n  - utter_Xywmv8uc\n* mood{"positive": "good"}\n  - utter_hwZIDQ5P\n  - utter_0H5XEC9h\n  - slot{"mood":"set"}',
            },
        ],
        story: '* hello\n - utter_hello',
    };
    
    // ------ test suite -------
    describe('story textIndexes and events are kept for all types of updates', () => {
        beforeEach(done => (async () => {
            await Stories.remove({ _id: { $in: storyIds } });
            await Stories.insert(storyFixtureA);
            await Stories.insert(storyFixtureB);
            done();
        })());
        after(done => (async () => {
            await Stories.remove();
            done();
        })());
        it('update an array of stories with matching ids', done => (async () => {
            try {
                await Meteor.callWithPromise('stories.update', [
                    { _id: storyIds[0], projectId: 'bf' },
                    { _id: storyIds[1], projectId: 'bf' },
                ]);
                const result = await Stories.find({ _id: { $in: storyIds } }).fetch();
                expect(result).to.have.length(2);
                expect(result[0].events).to.have.length(storyFixtureA.events.length);
                expect(result[0].textIndex).to.deep.equal({
                    contents: 'hello \n helpOptions \n how_are_you \n mood positive \n utter_hello \n utter_tXd-Pm66 \n utter_Xywmv8uc \n utter_hwZIDQ5P \n utter_0H5XEC9h \n action_help \n mood',
                    info: 'Welcome Story',
                });
                expect(result[1].events).to.have.length(storyFixtureB.events.length);
                expect(result[1].textIndex).to.deep.equal({
                    contents: 'hello \n helpOptions \n how_are_you \n mood positive \n utter_hello \n utter_tXd-Pm66 \n utter_Xywmv8uc \n utter_hwZIDQ5P \n utter_0H5XEC9h \n action_help \n mood',
                    info: 'Welcome Story',
                });
                done();
            } catch (error) {
                done(error);
            }
        })());
        it('throw an error when projectIds', done => (async () => {
            await Meteor.call('stories.update', [
                { _id: storyIds[0], projectId: 'bf' },
                { _id: storyIds[1], projectId: 'non_matching_id' },
            ], (error) => {
                expect(error).to.not.equal(undefined);
                done();
            });
        })());
        it('update a single story without a branch path', done => (async () => {
            try {
                await Meteor.callWithPromise('stories.update', {
                    _id: storyIds[0], projectId: 'bf',
                });
                const result = await Stories.findOne({ _id: storyIds[0] });
                expect(result.events).to.have.length(storyFixtureA.events.length);
                expect(result.textIndex).to.deep.equal({
                    contents: 'hello \n helpOptions \n how_are_you \n mood positive \n utter_hello \n utter_tXd-Pm66 \n utter_Xywmv8uc \n utter_hwZIDQ5P \n utter_0H5XEC9h \n action_help \n mood',
                    info: 'Welcome Story',
                });
                done();
            } catch (error) {
                done(error);
            }
        })());
        it('update a single story without a branch path', done => (async () => {
            try {
                await Meteor.callWithPromise('stories.update', {
                    _id: storyIds[0], projectId: 'bf', path: ['story_A', 'story_A_branch_A'],
                });
                const result = await Stories.findOne({ _id: storyIds[0] });
                expect(result.events).to.have.length(storyFixtureA.events.length);
                expect(result.textIndex).to.deep.equal({
                    contents: 'hello \n helpOptions \n how_are_you \n mood positive \n utter_hello \n utter_tXd-Pm66 \n utter_Xywmv8uc \n utter_hwZIDQ5P \n utter_0H5XEC9h \n action_help \n mood',
                    info: 'Welcome Story',
                });
                done();
            } catch (error) {
                done(error);
            }
        })());
    });
}
